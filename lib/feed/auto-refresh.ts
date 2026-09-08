import { supabaseServiceRole } from '../supabase/server';

// Keeps the competitor feed current without anyone remembering to run a script.
//
// Until now a refresh meant `npx tsx scripts/daily-refresh.ts` by hand, so the
// feed was only as fresh as the last time someone thought about it. This runs
// the same three steps from inside the application: once shortly after the
// server starts, and then once a day for as long as it stays up.
//
// It is deliberately conservative. A refresh only happens if the last one was
// long enough ago, so restarting the dev server ten times in an afternoon costs
// one refresh, not ten. Everything it calls is already idempotent: updates are
// deduplicated on (spark_id, spark_index), classification skips rows already
// done, and note generation skips rows that already have a note.

/** Hours between refreshes. A day, unless overridden. */
const INTERVAL_HOURS = Number(process.env.FEED_REFRESH_INTERVAL_HOURS ?? 24);

/** Wait this long before the first check, so the first page load stays fast. */
const BOOT_DELAY_MS = 20_000;

/** Sparks to pull, and notes to write, per run. */
const SPARKS_PER_RUN = Number(process.env.FEED_REFRESH_SPARKS ?? 200);
const NOTES_PER_RUN = Number(process.env.FEED_REFRESH_NOTES ?? 200);

/** Guards against two refreshes overlapping in one process. */
let running = false;

export interface RefreshOutcome {
  ran: boolean;
  reason: string;
  inserted?: number;
  notes?: number;
}

/**
 * When the last refresh finished, in milliseconds since the epoch.
 *
 * Reads the marker column if it exists. If migration 0018 has not been applied
 * the query fails, and we fall back to the newest stored update - slightly less
 * precise, but it means this works before anyone touches the database.
 */
async function lastRefreshAt(): Promise<number> {
  const db = supabaseServiceRole();

  const { data, error } = await db
    .from('llm_config')
    .select('last_feed_refresh_at')
    .eq('id', 1)
    .maybeSingle();

  if (!error && data) {
    const value = (data as { last_feed_refresh_at?: string | null }).last_feed_refresh_at;
    return value ? Date.parse(value) : 0;
  }

  const { data: newest } = await db
    .from('competitor_updates')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const created = (newest as { created_at?: string } | null)?.created_at;
  return created ? Date.parse(created) : 0;
}

/** Records that a refresh finished. Failure here is not worth failing the run. */
async function markRefreshed(): Promise<void> {
  try {
    await supabaseServiceRole()
      .from('llm_config')
      .update({ last_feed_refresh_at: new Date().toISOString() })
      .eq('id', 1);
  } catch {
    // Marker column absent: the created_at fallback above still applies.
  }
}

/**
 * Runs a refresh regardless of when the last one was. This is what the manual
 * "Refresh now" path and the scheduled job both end up calling.
 */
export async function refreshFeedNow(): Promise<RefreshOutcome> {
  if (running) return { ran: false, reason: 'a refresh is already in progress' };
  running = true;
  const started = Date.now();

  try {
    const { ingestCompetitorUpdates, pregenerateNotes } = await import('./ingest');
    const { classifyUnknownTypes } = await import('./classify-type');

    const ingest = await ingestCompetitorUpdates(SPARKS_PER_RUN);
    console.log(
      `[auto-refresh] ${ingest.sparksFetched} sparks -> ${ingest.inserted} new updates, ` +
        `${ingest.skipped} already held`
    );

    const cls = await classifyUnknownTypes(2000);
    console.log(`[auto-refresh] reclassified ${cls.reclassified} of ${cls.examined} examined`);

    const notes = await pregenerateNotes(NOTES_PER_RUN);
    console.log(`[auto-refresh] ${notes.generated} notes written, ${notes.failed} failed`);

    await markRefreshed();
    const seconds = Math.round((Date.now() - started) / 1000);
    console.log(`[auto-refresh] finished in ${seconds}s`);

    return {
      ran: true,
      reason: `completed in ${seconds}s`,
      inserted: ingest.inserted,
      notes: ingest.notesGenerated + notes.generated,
    };
  } catch (err) {
    // A failed refresh must never take the server down with it. The feed keeps
    // serving what it already holds, and the next attempt tries again.
    console.error(
      `[auto-refresh] failed: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`
    );
    return { ran: false, reason: 'failed, see server log' };
  } finally {
    running = false;
  }
}

/** Runs a refresh only if the feed is older than the interval. */
export async function maybeRefreshFeed(): Promise<RefreshOutcome> {
  const last = await lastRefreshAt();
  const ageHours = (Date.now() - last) / 3_600_000;

  if (last > 0 && ageHours < INTERVAL_HOURS) {
    const next = Math.round(INTERVAL_HOURS - ageHours);
    console.log(`[auto-refresh] feed is ${Math.round(ageHours)}h old, next refresh in ~${next}h`);
    return { ran: false, reason: `last refresh was ${Math.round(ageHours)}h ago` };
  }

  console.log(`[auto-refresh] feed is ${last ? `${Math.round(ageHours)}h` : 'un'}refreshed, pulling from Crayon`);
  return refreshFeedNow();
}

/** Set once the schedule is running, so repeated requests do not stack timers. */
let scheduled = false;

/**
 * Starts the schedule: one check shortly after the first request, then one a
 * day for as long as the process lives.
 *
 * Called from the feed API route rather than instrumentation.ts. Next compiles
 * instrumentation for the edge runtime as well as Node, and edge cannot resolve
 * the node builtins this chain reaches (crypto, child_process), so that route
 * logged a bundling error on every boot. Starting from a route that is already
 * Node-only and force-dynamic avoids the problem entirely, at the cost of
 * waiting for someone to open the app - which is the moment the feed matters.
 */
export function ensureFeedSchedule(): void {
  if (scheduled) return;
  if (process.env.FEED_AUTO_REFRESH === '0') {
    scheduled = true;
    console.log('[auto-refresh] disabled by FEED_AUTO_REFRESH=0');
    return;
  }
  scheduled = true;

  const check = () => {
    void maybeRefreshFeed();
  };
  setTimeout(check, BOOT_DELAY_MS).unref?.();
  setInterval(check, INTERVAL_HOURS * 3_600_000).unref?.();
  console.log(
    `[auto-refresh] scheduled: first check in ${BOOT_DELAY_MS / 1000}s, then every ${INTERVAL_HOURS}h`
  );
}
