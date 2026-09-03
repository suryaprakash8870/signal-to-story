/**
 * Re-test of the Meridian discovery call after the grounding/guardrail rebuild.
 * Proves: no fabricated Litera facts (SOC 2), no competitor-feature mix-up, no
 * customer name in marketing, and unconfirmed Litera facts become
 * "[Rep to confirm: ...]" notes.
 *
 * Run:  npx tsx scripts/meridian-retest.ts
 */
import { readFileSync } from 'fs';
import path from 'path';
for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const SIGNAL = `[Gong Call - Discovery: Meridian Partners (Prospect) × Litera - 2026-07-02]

Priya Nair (Litera, AE): Thanks for the time today. Before I dive in - what's driving you to look at a new document platform now?

Tom Becker (Meridian Partners, Director of Practice Tech): Honestly, our current setup is a mess of point tools. But I'll be transparent, you're not the only one we're talking to. We had a pretty detailed session with Novera last week.

Priya Nair: Appreciate the honesty. What stood out from the Novera conversation?

Tom Becker: Two things. First, their pricing came in noticeably lower - they quoted us a flat per-seat number that was roughly 30% under what we'd budgeted. Second, they've been pushing this new "compliance dashboard" that auto-flags risky clauses across a whole matter, not just one document.

Sofia Reyes (Meridian, Risk & Compliance Lead): The cross-matter view is what caught my attention. Right now we review documents one at a time. If something can surface risk across an entire matter automatically, that's a real time saver for my team. Novera demoed it and it looked slick.

Tom Becker: That said - Novera's a smaller vendor. We asked about their security posture and the answers were a bit thin. For a firm our size, SOC 2 and a real audit trail aren't optional. That's an open question for us with them.

Priya Nair: Got it. So lower price and the cross-matter compliance view are the draws, but security maturity is a concern. On the compliance side - is that a must-have for this cycle, or a nice-to-have?

Sofia Reyes: Trending toward must-have. Our clients are asking harder questions about risk, so anything that helps us get ahead of that is moving up the list.

Tom Becker: Price still matters most to procurement, though. If the numbers are far apart, that's a hard conversation internally regardless of features.

Priya Nair: Understood. That's helpful - let me put together something that speaks to both the compliance capability and the total cost picture.`;

async function main() {
  const { supabaseServiceRole } = await import('../lib/supabase/server');
  const { runPipeline } = await import('../lib/pipeline/orchestrate');
  const { getProviderStatus } = await import('../lib/llm');

  console.log('Active provider:', JSON.stringify(await getProviderStatus()), '\n');

  const db = supabaseServiceRole();
  await db.from('competitors').upsert({ name: 'Novera' }, { onConflict: 'name' });

  const { data: signal, error } = await db
    .from('signals')
    .insert({ raw_text: SIGNAL, source_type: 'gong' })
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

    // Quick automated checks on the known failure modes. Strip [Rep to confirm...]
    // notes first so a QUESTION about a capability isn't counted as an ASSERTION.
    const strip = (s: string) => s.replace(/\[rep to confirm[^\]]*\]/gi, ' ');
    const rawAll = (outs ?? []).map((o) => o.content).join('\n');
    const assertedAll = strip(rawAll).toLowerCase();
    const mkt = (outs ?? []).filter((o) => o.audience === 'marketing').map((o) => o.content).join('\n').toLowerCase();
    console.log('\n=== AUTO-CHECKS ===');
    console.log('Uses [Rep to confirm ...] notes (good):', /\[rep to confirm/i.test(rawAll));
    console.log('ASSERTS Litera SOC 2 outside a note (bad):', /soc 2/.test(assertedAll));
    console.log('ASSERTS Litera audit trails/robust security outside a note (bad):',
      /(audit trail|robust security|secure platform|enterprise-grade|comprehensive security)/.test(assertedAll));
    console.log('Marketing names "Meridian" (bad):', mkt.includes('meridian'));
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
