/**
 * Rewrites notes that were produced by a model the app no longer uses.
 *
 * Notes are not interchangeable: on our accuracy set the Cloudflare model
 * scored 4/8 against gpt-5's 8/8, so a note from it is not the same quality as
 * one beside it in the same feed. note_model records which model wrote each
 * note, which is what makes this targetable.
 *
 * Run:  npx tsx scripts/regenerate-stale-notes.ts [modelPrefix]
 */
import { readFileSync } from 'fs';
import path from 'path';

for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function main() {
  const prefix = process.argv[2] ?? 'cloudflare';
  const { supabaseServiceRole } = await import('../lib/supabase/server');
  const { generateRelevanceNote } = await import('../lib/context/relevance');
  const db = supabaseServiceRole();

  const { data, error } = await db
    .from('competitor_updates')
    .select('id, competitor_name, content')
    .like('note_model', `${prefix}%`);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as { id: string; competitor_name: string; content: string }[];
  console.log(`found ${rows.length} notes written by "${prefix}"`);
  if (rows.length === 0) return;

  let done = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      const result = await generateRelevanceNote(`Competitor: ${r.competitor_name}\n\n${r.content}`);
      const { error: writeErr } = await db
        .from('competitor_updates')
        .update({
          relevance_note: result.note,
          grounded_document: result.groundedIn?.documentTitle ?? null,
          grounded_section: result.groundedIn?.heading ?? null,
          note_generated_at: new Date().toISOString(),
          note_model: result.model ?? null,
          note_input_hash: result.inputHash ?? null,
        })
        .eq('id', r.id);
      if (writeErr) { failed++; console.log(`  save failed: ${writeErr.message}`); }
      else done++;
    } catch (e) {
      failed++;
      console.log(`  ${r.competitor_name}: ${e instanceof Error ? e.message.slice(0, 90) : String(e)}`);
    }
  }
  console.log(`rewritten ${done}, failed ${failed}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
