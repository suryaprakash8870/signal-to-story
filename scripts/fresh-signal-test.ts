/**
 * Fresh end-to-end pipeline test — runs one launch-type signal through ALL
 * stages (classify → interpret → route → package) and prints the saved outputs
 * so we can eyeball the new tone-calibration + battlecard prompt changes.
 *
 * Run:  npx tsx scripts/fresh-signal-test.ts
 */
import { readFileSync } from 'fs';
import path from 'path';

for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

// A classic "bait" signal: a product-page launch (an EARLY signal). The old
// prompt turned this into "will upend our stronghold" + a generic battlecard.
const SIGNAL =
  'SignForge published a product page announcing a new e-signature module ' +
  'with a native Salesforce add-in and AI-assisted clause tagging. The page ' +
  'shows a "Book a demo" button and a pricing teaser but lists no actual ' +
  'price. No customers or case studies are named yet.';

async function main() {
  const { supabaseServiceRole } = await import('../lib/supabase/server');
  const { runPipeline } = await import('../lib/pipeline/orchestrate');
  const { getProviderStatus } = await import('../lib/llm');

  console.log('Active provider:', JSON.stringify(await getProviderStatus()));

  const db = supabaseServiceRole();
  await db.from('competitors').upsert({ name: 'SignForge' }, { onConflict: 'name' });

  const { data: signal, error } = await db
    .from('signals')
    .insert({ raw_text: SIGNAL, source_type: 'manual' })
    .select('id')
    .single();
  if (error || !signal) {
    console.error('insert failed:', error?.message);
    process.exit(1);
  }
  console.log('Signal:', signal.id, '\n');

  try {
    const started = Date.now();
    await runPipeline(signal.id);
    console.log(`Pipeline finished in ${Math.round((Date.now() - started) / 1000)}s\n`);

    const { data: sig } = await db.from('signals').select('status').eq('id', signal.id).single();
    console.log('Final status:', sig?.status);

    const { data: outs } = await db
      .from('signal_outputs')
      .select('audience, output_type, content, unverified_claims')
      .eq('signal_id', signal.id);

    console.log(`\n=== ${outs?.length ?? 0} OUTPUTS ===`);
    for (const o of outs ?? []) {
      console.log(`\n--- [${o.audience}] ${o.output_type}  (claims: ${o.unverified_claims.length}) ---`);
      console.log(o.content);
    }
  } catch (e) {
    console.error('\nPIPELINE ERROR:', e instanceof Error ? e.message : e);
    const { data: sig } = await db.from('signals').select('status').eq('id', signal.id).single();
    console.log('Final status:', sig?.status);
  } finally {
    await db.from('signals').delete().eq('id', signal.id);
    console.log('\n(cleaned up)');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
