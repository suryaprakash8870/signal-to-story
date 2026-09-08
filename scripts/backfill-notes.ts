/**
 * Writes the "why it matters for us" note for every in-window update that is
 * missing one, printing progress as it goes.
 *
 * Safe to stop and restart. Each note is saved the moment it is written, and
 * the list of work is rebuilt from the database on every run, so a restart
 * picks up exactly where the last one stopped and never redoes finished work.
 *
 * Progress is printed per note rather than only at the end. An earlier version
 * reported nothing until it finished, so a run that was killed at 52 of 272
 * looked identical to one that had not started.
 *
 * Run:  npx tsx scripts/backfill-notes.ts
 */
import { readFileSync } from 'fs';
import path from 'path';

for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

interface Target {
  id: string;
  competitor_name: string;
  content: string;
  published_at: string;
}

async function main() {
  const started = Date.now();

  const { supabaseServiceRole } = await import('../lib/supabase/server');
  const { fetchAllRows } = await import('../lib/supabase/paginate');
  const { generateRelevanceNote } = await import('../lib/context/relevance');
  const db = supabaseServiceRole();

  const since = new Date();
  since.setDate(since.getDate() - 30);
  const iso = since.toISOString();

  // Paginated: a plain select stops at 1,000 rows without saying so, which is
  // what left several hundred updates permanently without a note.
  const targets = await fetchAllRows<Target>(
    (from, to) =>
      db
        .from('competitor_updates')
        .select('id, competitor_name, content, published_at')
        .gte('published_at', iso)
        .is('relevance_note', null)
        .order('published_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    'read updates needing a note'
  );

  console.log(`${targets.length} updates need a note\n`);
  if (targets.length === 0) return;

  let written = 0;
  let failed = 0;
  const failures = new Map<string, number>();

  for (const [i, t] of targets.entries()) {
    const label = `[${i + 1}/${targets.length}] ${t.competitor_name}`;
    try {
      const result = await generateRelevanceNote(
        `Competitor: ${t.competitor_name}\n\n${t.content}`
      );
      const { error } = await db
        .from('competitor_updates')
        .update({
          relevance_note: result.note,
          grounded_document: result.groundedIn?.documentTitle ?? null,
          grounded_section: result.groundedIn?.heading ?? null,
          note_generated_at: new Date().toISOString(),
          note_model: result.model ?? null,
          note_input_hash: result.inputHash ?? null,
        })
        .eq('id', t.id);

      if (error) throw new Error(`could not save: ${error.message}`);
      written++;
      console.log(`${label} ${result.general ? 'general' : `grounded in "${result.groundedIn?.heading}"`}`);
    } catch (err) {
      failed++;
      const reason = err instanceof Error ? err.message : String(err);
      const key = reason.replace(/\s+/g, ' ').split(/[.{]/)[0].trim().slice(0, 120);
      failures.set(key, (failures.get(key) ?? 0) + 1);
      console.log(`${label} FAILED: ${key}`);
    }

    // A running total every twenty notes, so a long run is readable at a glance.
    if ((i + 1) % 20 === 0) {
      const perNote = (Date.now() - started) / (i + 1);
      const left = Math.round((perNote * (targets.length - i - 1)) / 60000);
      console.log(`  ... ${written} written, ${failed} failed, about ${left} minutes left\n`);
    }
  }

  console.log(`\n${written} notes written, ${failed} failed`);
  for (const [reason, count] of [...failures.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  - ${reason}${count > 1 ? ` (${count}x)` : ''}`);
  }
  console.log(`completed in ${Math.round((Date.now() - started) / 60000)} minutes`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
