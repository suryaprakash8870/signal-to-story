/**
 * Generates relevance notes for feed updates that do not have one yet.
 *
 * pregenerateNotes() only covers the newest few per competitor, which is right
 * for a routine refresh. This script widens that so the whole in-window feed is
 * populated ahead of a client walkthrough, rather than leaving most cards on the
 * on-demand button.
 *
 * Run:  npx tsx scripts/generate-remaining-notes.ts [perCompetitor]
 */
import { readFileSync } from 'fs';
import path from 'path';

for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function main() {
  const perCompetitor = Number(process.argv[2] ?? 15);
  const { supabaseServiceRole } = await import('../lib/supabase/server');
  const { pregenerateNotes } = await import('../lib/feed/ingest');
  const db = supabaseServiceRole();

  // Deliberately does NOT change the configured backend. Forcing one here meant
  // the script kept selecting a backend that was out of quota, so every note
  // burned its full retry schedule before the fallback chain rescued it. Use
  // whatever the app is set to, and let the chain handle an outage.
  const { data: cfg } = await db.from('llm_config').select('selected_backend').eq('id', 1).maybeSingle();
  console.log(`backend: ${(cfg as { selected_backend?: string } | null)?.selected_backend ?? 'auto'}`);

  const started = Date.now();
  const result = await pregenerateNotes(perCompetitor);
  const { data } = await db.from('competitor_updates').select('relevance_note, grounded_document');
  const rows = data ?? [];
  const noted = rows.filter((r) => (r as { relevance_note: string | null }).relevance_note);
  const cited = rows.filter((r) => (r as { grounded_document: string | null }).grounded_document);

  console.log(`generated ${result.generated} notes in ${Math.round((Date.now() - started) / 1000)}s`);
  if (result.failed > 0) {
    console.log(`FAILED ${result.failed}:`);
    for (const e of result.errors) console.log(`  - ${e}`);
  }
  console.log(`with notes: ${noted.length} of ${rows.length}`);
  console.log(`citing a document: ${cited.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
