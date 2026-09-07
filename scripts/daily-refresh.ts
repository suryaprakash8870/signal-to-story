/**
 * One full refresh of the competitor feed: pull the latest Crayon Sparks,
 * store the individual updates, classify anything the emoji and keyword rules
 * cannot identify, and write the "why it matters for us" notes.
 *
 * This is what the daily scheduled job runs. Safe to run by hand at any time:
 * updates are deduplicated on (spark_id, spark_index), classification skips
 * rows already done, and note generation skips rows that already have one.
 *
 * Run:  npx tsx scripts/daily-refresh.ts [sparksPerRun] [notesPerCompetitor]
 */
import { readFileSync } from 'fs';
import path from 'path';

for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function main() {
  const perPage = Number(process.argv[2] ?? 200);
  const notesPer = Number(process.argv[3] ?? 200);
  const started = Date.now();

  const { supabaseServiceRole } = await import('../lib/supabase/server');
  const db = supabaseServiceRole();
  const { data: cfg } = await db.from('llm_config').select('selected_backend').eq('id', 1).maybeSingle();
  console.log(`backend: ${(cfg as { selected_backend?: string } | null)?.selected_backend ?? 'auto'}`);

  const { ingestCompetitorUpdates } = await import('../lib/feed/ingest');
  const ingest = await ingestCompetitorUpdates(perPage);
  console.log(
    `ingest: ${ingest.sparksFetched} sparks -> ${ingest.updatesFound} updates ` +
      `(${ingest.inserted} new, ${ingest.skipped} already held)`
  );
  console.log(`notes from ingest: ${ingest.notesGenerated} written, ${ingest.notesFailed} failed`);
  for (const e of ingest.noteErrors) console.log(`  - ${e}`);

  const { classifyUnknownTypes } = await import('../lib/feed/classify-type');
  const cls = await classifyUnknownTypes(2000);
  console.log(
    `classify: examined ${cls.examined}, reclassified ${cls.reclassified}, ` +
      `stayed other ${cls.stillOther}, failed ${cls.failed}`
  );

  const { pregenerateNotes } = await import('../lib/feed/ingest');
  const notes = await pregenerateNotes(notesPer);
  console.log(`notes backfill: ${notes.generated} written, ${notes.failed} failed`);
  for (const e of notes.errors) console.log(`  - ${e}`);

  const since = new Date();
  since.setDate(since.getDate() - 30);
  const inWin = await db
    .from('competitor_updates')
    .select('*', { count: 'exact', head: true })
    .gte('published_at', since.toISOString());
  const noted = await db
    .from('competitor_updates')
    .select('*', { count: 'exact', head: true })
    .gte('published_at', since.toISOString())
    .not('relevance_note', 'is', null);

  console.log(
    `\nfeed now: ${noted.count} of ${inWin.count} in-window updates have a note ` +
      `(${Math.round(((noted.count ?? 0) / (inWin.count || 1)) * 100)}%)`
  );
  console.log(`completed in ${Math.round((Date.now() - started) / 1000)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
