/**
 * Classifies stored feed updates whose type could not be determined from
 * Crayon's emoji or our keyword rules.
 *
 * Safe to re-run: rows already classified by the model are skipped, and
 * Crayon's own emoji labels are never overridden.
 *
 * Run:  npx tsx scripts/classify-update-types.ts [limit]
 */
import { readFileSync } from 'fs';
import path from 'path';

for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function main() {
  const limit = Number(process.argv[2] ?? 2000);
  const { supabaseServiceRole } = await import('../lib/supabase/server');
  const { classifyUnknownTypes } = await import('../lib/feed/classify-type');
  const db = supabaseServiceRole();

  const before = await db
    .from('competitor_updates')
    .select('*', { count: 'exact', head: true })
    .eq('update_type', 'other');

  const started = Date.now();
  const r = await classifyUnknownTypes(limit);
  const after = await db
    .from('competitor_updates')
    .select('*', { count: 'exact', head: true })
    .eq('update_type', 'other');

  console.log(`examined ${r.examined} in ${Math.round((Date.now() - started) / 1000)}s`);
  console.log(`  reclassified : ${r.reclassified}`);
  console.log(`  stayed other : ${r.stillOther}`);
  console.log(`  failed       : ${r.failed}`);
  console.log(`  by type      : ${JSON.stringify(r.byType)}`);
  console.log(`'other' count: ${before.count} -> ${after.count}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
