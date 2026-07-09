/**
 * Third validation — a Crayon-style market-news alert (no specific customer).
 * Tests the guardrails on a different shape: empty subject_account, a competitor
 * move that baits Litera-capability claims, and marketing generalization.
 *
 * Run:  npx tsx scripts/crayon-retest.ts
 */
import { readFileSync } from 'fs';
import path from 'path';
for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const SIGNAL = `[Crayon Alert — Competitor Intelligence — 2026-07-05]

Source: LexPoint press release + product page.

LexPoint announced "LexPoint Verify," a new AI contract-review add-in that runs
inside Microsoft Word. Per the release, it flags missing clauses and off-standard
language in real time as lawyers draft, and claims a 40% reduction in review time
based on an internal pilot with three firms (firms not named). The product page
lists integrations with iManage and NetDocuments. Pricing is described as
"per-seat, volume-tiered" with no figure shown. LexPoint also states the tool is
"built on a private, enterprise-grade model" and that customer data "is never
used for training." A launch webinar is scheduled for next month; general
availability is quoted as Q4.`;

async function main() {
  const { supabaseServiceRole } = await import('../lib/supabase/server');
  const { runPipeline } = await import('../lib/pipeline/orchestrate');
  const { getProviderStatus } = await import('../lib/llm');

  console.log('Active provider:', JSON.stringify(await getProviderStatus()), '\n');

  const db = supabaseServiceRole();
  await db.from('competitors').upsert({ name: 'LexPoint' }, { onConflict: 'name' });

  const { data: signal, error } = await db
    .from('signals')
    .insert({ raw_text: SIGNAL, source_type: 'crayon' })
    .select('id')
    .single();
  if (error || !signal) { console.error('insert failed:', error?.message); process.exit(1); }
  console.log('Signal:', signal.id, '\n');

  try {
    const t = Date.now();
    await runPipeline(signal.id);
    console.log(`Pipeline finished in ${Math.round((Date.now() - t) / 1000)}s`);

    const { data: sig } = await db.from('signals').select('status').eq('id', signal.id).single();
    console.log('Final status:', sig?.status);

    const { data: cls } = await db
      .from('signal_classification')
      .select('signal_type, business_area, urgency, audience_relevance')
      .eq('signal_id', signal.id)
      .maybeSingle();
    console.log('\nClassification:', JSON.stringify(cls));

    const { data: outs } = await db
      .from('signal_outputs')
      .select('audience, output_type, content')
      .eq('signal_id', signal.id);

    console.log(`\n=== ${outs?.length ?? 0} OUTPUTS ===`);
    for (const o of outs ?? []) {
      console.log(`\n--- [${o.audience}] ${o.output_type} ---\n${o.content}`);
    }

    // Auto-checks. Strip [Rep to confirm...] notes so a QUESTION isn't counted
    // as an ASSERTION.
    const strip = (s: string) => s.replace(/\[rep to confirm[^\]]*\]/gi, ' ');
    const rawAll = (outs ?? []).map((o) => o.content).join('\n');
    const asserted = strip(rawAll).toLowerCase();
    console.log('\n=== AUTO-CHECKS ===');
    console.log('Uses [Rep to confirm ...] notes where needed:', /\[rep to confirm/i.test(rawAll));
    console.log('ASSERTS an unconfirmed Litera capability outside a note (bad):',
      /litera[^.\]]*(soc 2|audit trail|robust|enterprise-grade|secure platform|private model|never used for training|word add-in|iManage|netdocuments)/i.test(asserted));
    console.log('Wrongly attributes LexPoint\'s features to Litera (bad):',
      /litera[^.\]]*(verify|40%|reduction in review time)/i.test(asserted));
    console.log('Invents a LexPoint price (bad):', /\$\s?\d|\d+\s?(usd|dollars|per seat|per-seat).*lexpoint|lexpoint.*\$\s?\d/i.test(asserted));
  } catch (e) {
    console.error('\nPIPELINE ERROR:', e instanceof Error ? e.message : e);
    const { data: sig } = await db.from('signals').select('status').eq('id', signal.id).single();
    console.log('Final status:', sig?.status);
  } finally {
    await db.from('signals').delete().eq('id', signal.id);
    console.log('\n(cleaned up)');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
