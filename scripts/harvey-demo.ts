/**
 * Stages the Harvey AI demo signal for the CFO screen-recording walkthrough.
 * Runs the REAL pipeline (classify -> interpret -> route -> package) and leaves
 * the signal + outputs in the DB, sitting in the review queue, ready to record.
 *
 * Run:  npx tsx scripts/harvey-demo.ts
 */
import { readFileSync } from 'fs';
import path from 'path';

for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const COMPETITOR = 'Harvey AI';
const KNOWN_FACTS = [
  'Harvey AI is a legal-AI startup building generative-AI assistants for law firms and in-house legal teams.',
  'Harvey has historically focused on legal research, Q&A, and document analysis rather than end-to-end drafting.',
  'Harvey is backed by Sequoia Capital and the OpenAI Startup Fund.',
  'Litera competes in legal document drafting, proofreading, and transaction management for law firms.',
];

// A grounded, self-contained product-launch signal so the interpretation has no
// unverified claims and the outputs are approvable on camera.
const SIGNAL =
  'Harvey AI announced "Harvey for Transactions," a new agentic AI module that ' +
  'drafts and reviews M&A transaction documents end to end, and named three ' +
  'AmLaw 100 firms as launch customers. Harvey also disclosed a $300M Series E ' +
  'funding round. The announcement positions Harvey as moving beyond legal ' +
  'research into document drafting and deal workflows — directly overlapping ' +
  "Litera's transaction management and drafting products.";

async function main() {
  const { supabaseServiceRole } = await import('../lib/supabase/server');
  const { runPipeline } = await import('../lib/pipeline/orchestrate');
  const { getProviderStatus } = await import('../lib/llm');

  console.log('Active provider:', JSON.stringify(await getProviderStatus()));

  const db = supabaseServiceRole();

  // Competitor with grounding facts.
  await db
    .from('competitors')
    .upsert({ name: COMPETITOR, known_facts: KNOWN_FACTS }, { onConflict: 'name' });

  // Clear any prior Harvey demo signal so re-runs are clean.
  const { data: prior } = await db.from('signals').select('id').eq('raw_text', SIGNAL);
  for (const p of prior ?? []) {
    await db.from('signal_outputs').delete().eq('signal_id', p.id);
    await db.from('signals').delete().eq('id', p.id);
  }

  const { data: signal, error } = await db
    .from('signals')
    .insert({ raw_text: SIGNAL, source_type: 'crayon' })
    .select('id')
    .single();
  if (error || !signal) {
    console.error('insert failed:', error?.message);
    process.exit(1);
  }
  console.log('Signal:', signal.id, '\n');

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
    console.log(`\n--- [${o.audience}] ${o.output_type}  (unverified: ${o.unverified_claims.length}) ---`);
    console.log(o.content);
  }
  console.log(`\nSignal kept for the demo. View at /signals/${signal.id} and /review`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
