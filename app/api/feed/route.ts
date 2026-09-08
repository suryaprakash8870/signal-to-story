import { NextRequest, NextResponse } from 'next/server';
import { supabaseServiceRole } from '@/lib/supabase/server';
import { ensureFeedSchedule } from '@/lib/feed/auto-refresh';
import { fetchAllRows } from '@/lib/supabase/paginate';
import { requireRole, RESEARCHERS } from '@/lib/auth/roles';

// Reads request state and live data, so it must never be statically
// evaluated at build time.
export const dynamic = 'force-dynamic';

// The PM feed: competitor updates from the rolling 30-day window.
//
// GET /api/feed                      -> competitor list with counts
// GET /api/feed?competitor=Name      -> that competitor's updates
// GET /api/feed?competitor=X&type=release -> filtered by product-signal type

// Starting the daily Crayon refresh from here, rather than from a server
// startup hook, keeps it on the Node runtime where it belongs. It costs one
// boolean check per request and starts the first pull twenty seconds after
// someone opens the feed.
ensureFeedSchedule();

const WINDOW_DAYS = 30;

function windowStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - WINDOW_DAYS);
  return d.toISOString();
}

/**
 * Turns a database error into a safe response.
 *
 * Two things go wrong here that should not reach a reader as a raw 500. The
 * upstream gateway rejects anything that looks like an injection attempt and
 * answers with an HTML block page rather than JSON, so `error.message` can be a
 * whole web page. And a rejected filter value is the caller's mistake, not a
 * server fault, so it deserves a 400.
 *
 * The detail goes to the server log either way; the caller gets a sentence.
 */
function dbError(error: { message: string }, context: string) {
  const raw = error.message ?? '';
  console.error(`[feed] ${context}: ${raw.slice(0, 300)}`);

  const looksLikeHtml = /<!DOCTYPE|<html/i.test(raw);
  if (looksLikeHtml) {
    return NextResponse.json(
      { error: 'That request could not be processed. Please check the filter values and try again.' },
      { status: 400 }
    );
  }
  return NextResponse.json({ error: 'The feed could not be loaded.' }, { status: 500 });
}

export async function GET(req: NextRequest) {
  // Matrix rows 1, 3 and 4: Admin, PMM and PM work in the feed and a Viewer
  // reads it. A Consumer receives content in Teams and email instead, and has
  // no feed access at all.
  const guard = await requireRole([...RESEARCHERS, 'viewer']);
  if (!guard.ok) return guard.response;

  const competitor = req.nextUrl.searchParams.get('competitor');
  const type = req.nextUrl.searchParams.get('type');
  const db = supabaseServiceRole();
  const since = windowStart();

  // No competitor selected: return the left-rail list with per-competitor counts.
  if (!competitor) {
    type Row = { competitor_name: string; id: string; published_at: string };

    // Paginated. A plain select returns at most 1,000 rows and reports no
    // error, so the rail was counting whichever thousand came back: Avvoka
    // showed 9 updates against the 42 actually held.
    let data: Row[];
    try {
      data = await fetchAllRows<Row>(
        (from, to) =>
          db
            .from('competitor_updates')
            .select('competitor_name, id, published_at')
            .gte('published_at', since)
            .order('published_at', { ascending: false })
            .order('id', { ascending: true })
            .range(from, to),
        'competitor list'
      );
    } catch (err) {
      return dbError({ message: err instanceof Error ? err.message : String(err) }, 'competitor list');
    }

    type Entry = {
      name: string;
      count: number;
      latest: string;
      ids: string[];
      inCrayon?: boolean;
    };
    const byName = new Map<string, Entry>();
    for (const row of data) {
      const entry: Entry = byName.get(row.competitor_name) ?? {
        name: row.competitor_name,
        count: 0,
        latest: row.published_at,
        ids: [],
      };
      entry.count++;
      entry.ids.push(row.id);
      if (row.published_at > entry.latest) entry.latest = row.published_at;
      byName.set(row.competitor_name, entry);
    }

    // Include every competitor on Litera's watchlist, even those with no
    // updates. A PM needs to see that a competitor is being watched but has no
    // recent activity, rather than wondering why it is missing entirely.
    const { data: tracked } = await db
      .from('competitors')
      .select('name, in_crayon')
      .eq('tracked', true);
    for (const c of (tracked ?? []) as { name: string; in_crayon: boolean | null }[]) {
      const existing = byName.get(c.name);
      if (existing) {
        existing.inCrayon = c.in_crayon ?? true;
      } else {
        byName.set(c.name, {
          name: c.name,
          count: 0,
          latest: '',
          ids: [],
          inCrayon: c.in_crayon ?? false,
        });
      }
    }

    // Competitors with recent activity first (newest first), then the quiet
    // ones alphabetically.
    const competitors = [...byName.values()].sort((a, b) => {
      if (a.latest && b.latest) return b.latest.localeCompare(a.latest);
      if (a.latest) return -1;
      if (b.latest) return 1;
      return a.name.localeCompare(b.name);
    });
    return NextResponse.json({ competitors, windowDays: WINDOW_DAYS });
  }

  // A competitor is selected: return its updates, newest first.
  let query = db
    .from('competitor_updates')
    .select(
      'id, competitor_name, update_type, content, source_url, published_at, relevance_note, grounded_document, grounded_section, note_feedback'
    )
    .eq('competitor_name', competitor)
    .gte('published_at', since)
    .order('published_at', { ascending: false });

  if (type && type !== 'all') query = query.eq('update_type', type);

  const { data, error } = await query;
  if (error) return dbError(error, 'competitor updates');

  return NextResponse.json({ updates: data ?? [], windowDays: WINDOW_DAYS });
}
