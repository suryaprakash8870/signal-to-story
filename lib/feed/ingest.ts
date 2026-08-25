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
}

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
  return [{ index: 0, type: 'other', text: text.slice(0, 1500), sourceUrl: null }];
}

/**
 * Fetches Sparks and stores the updates inside them.
 * `perPage` caps how many Sparks are pulled in one run.
 */
export async function ingestCompetitorUpdates(perPage = 20): Promise<IngestResult> {
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

  // Match competitor names to existing competitor rows where possible, so the
  // feed can link through to tier/owner later. Unmatched names still work.
  const { data: competitors } = await db.from('competitors').select('id, name');
  const idByName = new Map(
    (competitors ?? []).map((c: { id: string; name: string }) => [c.name.toLowerCase(), c.id])
  );

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

  return { sparksFetched: sparks.length, updatesFound, inserted, skipped };
}
