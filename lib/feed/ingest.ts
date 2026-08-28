import { supabaseServiceRole } from '../supabase/server';
import { parseSparkUpdates } from './parse-updates';

// Pulls Crayon Sparks, splits each into its individual competitor updates, and
// stores them for the PM feed. Deduped on (spark_id, spark_index), so re-running
// is safe and only genuinely new updates are added.

const DEFAULT_BASE = 'https://app.crayon.co';

export interface IngestResult {
  sparksFetched: number;
  updatesFound: number;
  inserted: number;
  skipped: number;
  notesGenerated: number;
}

/** How many of the newest updates per competitor get a note generated up front. */
const PREGENERATE_PER_COMPETITOR = 5;

/**
 * Last-resort update for a Spark with no parseable bullets. Converts markdown
 * table rows into readable sentences and drops separator rows and headers, so
 * the feed never shows raw pipe-delimited markup.
 */
function buildFallback(content: string): { index: number; type: 'other'; text: string; sourceUrl: null }[] {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    // Drop footnote definitions and table separator rows.
    .filter((l) => !/^\[\^[^\]]+\]:/.test(l))
    .filter((l) => !/^\|?\s*(:?-{2,}:?\s*\|)+/.test(l));

  const cleaned: string[] = [];
  for (const line of lines) {
    if (line.startsWith('|')) {
      // Table row: keep the cells as "Label: value" prose.
      const cells = line
        .split('|')
        .map((c) => c.replace(/\*\*/g, '').trim())
        .filter(Boolean);
      if (cells.length >= 2) cleaned.push(`${cells[0]}: ${cells.slice(1).join(' — ')}`);
      else if (cells.length === 1) cleaned.push(cells[0]);
    } else {
      cleaned.push(line.replace(/\*\*/g, '').replace(/\[\^[^\]]+\]/g, '').trim());
    }
  }

  const text = cleaned.join(' ').replace(/\s+/g, ' ').trim();
  if (text.split(/\s+/).length < 8) return [];

  // Table-only Sparks are frequently Crayon's own competitive analysis about us
  // (objection tables, "where Litera wins") rather than competitor news. Those
  // belong on a battlecard, not in this feed, and grounding a relevance note
  // against them produces notes that confuse whose product is whose.
  if (/where litera (wins|loses)|why it matters for litera sales|representative prospect quote|objection or question/i.test(text)) {
    return [];
  }

  return [{ index: 0, type: 'other', text: text.slice(0, 1500), sourceUrl: null }];
}

/**
 * Fetches Sparks and stores the updates inside them.
 * `perPage` caps how many Sparks are pulled in one run.
 *
 * 50 rather than 20, because watchlist filtering now discards every Spark for a
 * competitor Litera does not track. A small page would spend most of its budget
 * on Sparks that are then thrown away, leaving watchlist competitors looking
 * quiet when they are not.
 */
export async function ingestCompetitorUpdates(perPage = 50): Promise<IngestResult> {
  const apiKey = process.env.CRAYON_API_KEY;
  if (!apiKey) throw new Error('CRAYON_API_KEY is not configured.');

  const url = `${DEFAULT_BASE}/papi/sparks/?live_tiles_only=true&page=1&per_page=${perPage}`;
  const res = await fetch(url, {
    headers: { 'X-API-KEY': apiKey, Accept: 'application/json' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Crayon sparks query failed: ${res.status}`);

  const data = await res.json();
  const sparks: Record<string, unknown>[] = Array.isArray(data)
    ? data
    : ((data.sparks ?? data.results ?? []) as Record<string, unknown>[]);

  const db = supabaseServiceRole();

  // Litera's watchlist is authoritative, not Crayon's. Crayon tracks some
  // competitors Litera has not listed, and those updates are discarded here so
  // the feed only ever shows competitors Litera actually cares about.
  //
  // If no competitor has been marked tracked yet (i.e. the list has not been
  // seeded), everything is accepted so the feed still works out of the box.
  const { data: competitors } = await db
    .from('competitors')
    .select('id, name, tracked');
  const rows = (competitors ?? []) as { id: string; name: string; tracked?: boolean }[];
  const idByName = new Map(rows.map((c) => [c.name.toLowerCase(), c.id]));
  const trackedNames = new Set(
    rows.filter((c) => c.tracked).map((c) => c.name.toLowerCase())
  );
  const filterToWatchlist = trackedNames.size > 0;

  let updatesFound = 0;
  let inserted = 0;
  let skipped = 0;

  for (const spark of sparks) {
    const sparkId = String(spark.id ?? spark.automated_spark_id ?? '');
    if (!sparkId) continue;

    const competitors = (spark.competitors ?? []) as { name?: string }[];
    const competitorName = competitors[0]?.name?.trim();
    // A feed is per competitor, so an unattributed Spark has nowhere to sit.
    if (!competitorName) continue;
    // Skip competitors that are not on Litera's watchlist.
    if (filterToWatchlist && !trackedNames.has(competitorName.toLowerCase())) continue;

    const publishedAt = (spark.created_at as string) ?? new Date().toISOString();
    const content = (spark.content ?? spark.changes_section ?? '') as string;

    const parsed = parseSparkUpdates(content);
    // Fall back to the whole Spark when it has no recognisable bullets, so a
    // competitor never silently disappears from the feed. Some Sparks are
    // written purely as markdown tables, which read as unusable pipe-delimited
    // noise, so the fallback strips table markup down to readable prose.
    const updates = parsed.length ? parsed : buildFallback(content);

    updatesFound += updates.length;

    for (const u of updates) {
      const { error } = await db.from('competitor_updates').insert({
        competitor_name: competitorName,
        competitor_id: idByName.get(competitorName.toLowerCase()) ?? null,
        update_type: u.type,
        content: u.text,
        source_url: u.sourceUrl,
        published_at: publishedAt,
        spark_id: sparkId,
        spark_index: u.index,
      });
      if (error) {
        // 23505 = unique violation, i.e. already ingested. Expected on re-run.
        if (error.code === '23505') skipped++;
        else throw new Error(`failed to insert update: ${error.message}`);
      } else {
        inserted++;
      }
    }
  }

  const notesGenerated = await pregenerateNotes();

  return { sparksFetched: sparks.length, updatesFound, inserted, skipped, notesGenerated };
}

/**
 * Generates relevance notes for the newest updates per competitor, so a PM
 * lands on a populated feed rather than a wall of "generate" buttons. Older
 * updates keep generating on demand, which avoids spending a model call on
 * every item when most are never opened.
 *
 * Failures are swallowed per update: a note that cannot be generated simply
 * stays empty and falls back to the on-demand button, rather than failing the
 * whole refresh.
 */
export async function pregenerateNotes(
  perCompetitor = PREGENERATE_PER_COMPETITOR
): Promise<number> {
  const db = supabaseServiceRole();

  // Only consider updates still inside the feed's 30-day window.
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data: rows, error } = await db
    .from('competitor_updates')
    .select('id, competitor_name, content, relevance_note, published_at')
    .gte('published_at', since.toISOString())
    .order('published_at', { ascending: false });
  if (error || !rows) return 0;

  // Take the newest N per competitor that do not already have a note.
  const seenPerCompetitor = new Map<string, number>();
  const targets: { id: string; competitor_name: string; content: string }[] = [];
  for (const r of rows as { id: string; competitor_name: string; content: string; relevance_note: string | null }[]) {
    const n = seenPerCompetitor.get(r.competitor_name) ?? 0;
    if (n >= perCompetitor) continue;
    seenPerCompetitor.set(r.competitor_name, n + 1);
    if (!r.relevance_note) targets.push(r);
  }

  if (targets.length === 0) return 0;

  // Imported lazily so a feed refresh does not pull the LLM stack when there is
  // nothing to generate.
  const { generateRelevanceNote } = await import('../context/relevance');

  let generated = 0;
  for (const t of targets) {
    try {
      const result = await generateRelevanceNote(
        `Competitor: ${t.competitor_name}\n\n${t.content}`
      );
      const { error: writeErr } = await db
        .from('competitor_updates')
        .update({
          relevance_note: result.note,
          grounded_document: result.groundedIn?.documentTitle ?? null,
          grounded_section: result.groundedIn?.heading ?? null,
          note_generated_at: new Date().toISOString(),
        })
        .eq('id', t.id);
      if (!writeErr) generated++;
    } catch {
      // Leave this one for the on-demand button rather than failing the refresh.
    }
  }
  return generated;
}
