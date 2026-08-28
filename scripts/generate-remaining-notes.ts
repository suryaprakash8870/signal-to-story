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

  // Cloudflare has no hourly token expiry, so a long run cannot die halfway
  // through the way an Entra token does.
  await db.from('llm_config').update({ selected_backend: 'cloudflare' }).eq('id', 1);

  const started = Date.now();
  const n = await pregenerateNotes(perCompetitor);
  const { data } = await db.from('competitor_updates').select('relevance_note, grounded_document');
  const rows = data ?? [];
  const noted = rows.filter((r) => (r as { relevance_note: string | null }).relevance_note);
  const cited = rows.filter((r) => (r as { grounded_document: string | null }).grounded_document);

  console.log(`generated ${n} notes in ${Math.round((Date.now() - started) / 1000)}s`);
  console.log(`with notes: ${noted.length} of ${rows.length}`);
  console.log(`citing a document: ${cited.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
