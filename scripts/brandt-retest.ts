/**
 * Re-run the Brandt & Wu / Clarive positioning call after the packaging redesign
 * (specificity framework). Checks that outputs are concrete, not generic filler.
 *
 * Run:  npx tsx scripts/brandt-retest.ts
 */
import { readFileSync } from 'fs';
import path from 'path';
for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const SIGNAL = `[Gong Call — Discovery: Brandt & Wu LLP × Litera — 2026-07-08]

Priya Nair (Litera, Account Executive): Thanks for the time. Before we get into your workflow, I'm curious what's on your radar right now in the space.
Elena Brandt (Brandt & Wu, Managing Partner): Honestly? Clarive is everywhere lately. I can't open LinkedIn without seeing them.
Priya Nair: I've noticed the volume too. What's the message that's landing with you?
Elena Brandt: They've gone all-in on this "AI-native contract intelligence" positioning. Their whole campaign is basically "the end of manual review." It's a bold line.
Raj Mehta (Brandt & Wu, Director of Legal Ops): And it's not just ads. They ran a keynote at LegalTech last month, they've got a "State of AI in Legal" report making the rounds, and a few of our partners forwarded it internally.
Priya Nair: So it's a full positioning push — campaign, event, thought leadership. What's making it stick?
Raj Mehta: The framing, mostly. They've made "manual review" sound old-fashioned. Even if the product is early, the narrative is really clean. It reframes the category around AI.
Elena Brandt: That's the part that concerns me — not the tech, the story. When the managing partners start repeating a competitor's tagline in meetings, that's a marketing problem for whoever they're comparing you to.
Priya Nair: Fair. Is the messaging actually changing how you evaluate, or is it just noise?
Elena Brandt: A bit of both. It's raised the bar on how we expect vendors to talk about AI. If your positioning sounds cautious next to "the end of manual review," you look behind.
Raj Mehta: To be balanced — when we dug in, a lot of it is aspirational. The demo didn't fully back the tagline. But the messaging is winning the room before the product conversation even starts.
Priya Nair: That's useful. So the gap you're seeing is narrative, not necessarily capability.
Elena Brandt: Exactly. Whoever competes with them needs a sharper story about outcomes, not just features. "We do AI too" won't cut it against a category-defining line.
Raj Mehta: And the report is doing a lot of work. It's framed as neutral research but it obviously centers their worldview. Partners treat it as market truth.
Priya Nair: Understood. Anything on pricing or product in their push, or is it purely positioning?
Raj Mehta: Purely positioning so far. No pricing, no hard product claims we could pin down. It's a brand and narrative play.
Elena Brandt: Which is why I raised it. It's less "should we switch" and more "the market conversation is being shaped by one vendor's message right now."
Priya Nair: That's exactly the kind of signal worth taking back internally. Thank you both — let me follow up with a point of view that speaks to outcomes, not just an AI checkbox.
Elena Brandt: Appreciate it. Whoever tells the better outcome story is going to win the next few RFPs.`;

async function main() {
  const { supabaseServiceRole } = await import('../lib/supabase/server');
  const { runPipeline } = await import('../lib/pipeline/orchestrate');
  const { getProviderStatus } = await import('../lib/llm');

  console.log('Active provider:', JSON.stringify(await getProviderStatus()), '\n');
  const db = supabaseServiceRole();
  await db.from('competitors').upsert({ name: 'Clarive' }, { onConflict: 'name' });

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

    const { data: outs } = await db
      .from('signal_outputs')
      .select('audience, output_type, content')
      .eq('signal_id', signal.id);

    console.log(`\n=== ${outs?.length ?? 0} OUTPUTS ===`);
    for (const o of outs ?? []) console.log(`\n--- [${o.audience}] ${o.output_type} ---\n${o.content}`);

    const byType = (t: string) => (outs ?? []).find((o) => o.output_type === t)?.content ?? '';
    const mkt = byType('marketing_angle');
    const allText = (outs ?? []).map((o) => o.content).join('\n').toLowerCase();
    const BANNED = ['stay attuned', 'remain relevant', 'stay ahead', 'evolving landscape', 'proactively engage', 'tailor our solution', 'meet their needs', 'unique solution'];
    console.log('\n=== AUTO-CHECKS ===');
    console.log('Marketing is SPECIFIC (mentions narrative/outcome/reframe/proof/story):',
      /(narrative|outcome|reframe|proof|category|story|substance)/i.test(mkt));
    console.log('Marketing names "Brandt" (bad):', /brandt/i.test(mkt));
    console.log('Banned generic filler anywhere (bad):', BANNED.filter((b) => allText.includes(b)));
  } catch (e) {
    console.error('\nPIPELINE ERROR:', e instanceof Error ? e.message : e);
  } finally {
    await db.from('signals').delete().eq('id', signal.id);
    console.log('\n(cleaned up)');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
