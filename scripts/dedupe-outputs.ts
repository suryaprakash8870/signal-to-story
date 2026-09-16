/**
 * Removes duplicate audience drafts left by the double-run bug.
 *
 * Two triggers could start the pipeline for the same signal at once - the feed's
 * "Send to Signals" and the signal page's auto-process - so each escalated item
 * ended up with two complete sets of outputs. Both routes are fixed; this clears
 * what they already wrote.
 *
 * A signal's outputs are written in one batch, so every row from one run shares
 * a created_at. The newest batch is kept and older ones removed.
 *
 * Nothing that has been approved, rejected or published is touched, even if it
 * belongs to an older batch - a human decision outranks tidiness, and a
 * published row is a record of something that actually went out.
 *
 * Run:  npx tsx scripts/dedupe-outputs.ts          (report only)
 *       npx tsx scripts/dedupe-outputs.ts --apply  (delete)
 */
import { readFileSync } from 'fs';
import path from 'path';

for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

interface Row {
  id: string;
  signal_id: string;
  audience: string;
  output_type: string;
  created_at: string;
  approved: boolean;
  rejected: boolean;
  published_at: string | null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const { supabaseServiceRole } = await import('../lib/supabase/server');
  const { fetchAllRows } = await import('../lib/supabase/paginate');
  const db = supabaseServiceRole();

  const rows = await fetchAllRows<Row>(
    (from, to) =>
      db
        .from('signal_outputs')
        .select('id, signal_id, audience, output_type, created_at, approved, rejected, published_at')
        .order('signal_id', { ascending: true })
        .order('created_at', { ascending: true })
        .range(from, to),
    'read outputs'
  );

  const bySignal = new Map<string, Row[]>();
  for (const r of rows) {
    if (!bySignal.has(r.signal_id)) bySignal.set(r.signal_id, []);
    bySignal.get(r.signal_id)!.push(r);
  }

  const doomed: Row[] = [];
  let signalsAffected = 0;
  let protectedRows = 0;

  for (const [signalId, outputs] of bySignal) {
    const batches = [...new Set(outputs.map((o) => o.created_at))].sort();
    if (batches.length < 2) continue;

    signalsAffected++;

    // Keep the fullest run, and the newest only as a tiebreak. Picking "newest"
    // alone would discard a complete set in favour of one that was still being
    // written, or one where a stage failed partway.
    const sizeOf = (batch: string) => outputs.filter((o) => o.created_at === batch).length;
    const keep = [...batches].sort((a, b) => sizeOf(b) - sizeOf(a) || b.localeCompare(a))[0];
    const older = outputs.filter((o) => o.created_at !== keep);

    for (const row of older) {
      if (row.approved || row.rejected || row.published_at) {
        protectedRows++;
        continue;
      }
      doomed.push(row);
    }

    console.log(
      `${signalId.slice(0, 8)}  ${batches.length} runs of ${batches
        .map(sizeOf)
        .join('/')} -> keeping ${sizeOf(keep)}`
    );
  }

  console.log(
    `\n${signalsAffected} signal(s) ran more than once. ${doomed.length} duplicate output(s) to remove.`
  );
  if (protectedRows > 0) {
    console.log(`${protectedRows} left alone because they were approved, rejected or published.`);
  }

  if (!apply) {
    console.log('\nNothing changed. Re-run with --apply to delete them.');
    return;
  }

  let removed = 0;
  for (const row of doomed) {
    const { error } = await db.from('signal_outputs').delete().eq('id', row.id);
    if (error) console.log(`  could not remove ${row.id}: ${error.message}`);
    else removed++;
  }
  console.log(`\nremoved ${removed} duplicate output(s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
