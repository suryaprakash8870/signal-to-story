/**
 * Re-run the Halden & Cross / Verita AI renewal call after two fixes:
 *  (1) battlecard must LEAD with the competitor's weakness (Verita's weak security),
 *  (2) sales copy must hedge unconfirmed Litera capabilities like the other audiences.
 *
 * Run:  npx tsx scripts/halden-retest.ts
 */
import { readFileSync } from 'fs';
import path from 'path';
for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const SIGNAL = `[Gong Call — Renewal & Expansion Review: Halden & Cross LLP × Litera — 2026-07-08]

Priya Nair (Litera, Account Executive): Thanks for making time, both of you. This is our FY26 renewal check-in, and I know the innovation team had some things they wanted to raise, so let's just get into it.
Nina Okafor (Halden & Cross, General Counsel): Appreciate it, Priya. Overall the platform's been steady this year, adoption is good with the associates. But I'll be direct — we've been looking at Verita AI, and the partners asked me to bring it up before we commit to another year.
Priya Nair: I'd rather you tell me straight, so thank you. What prompted the Verita conversation?
Marcus Bell (Halden & Cross, Head of Knowledge Management): They did a demo about three weeks ago. Two things stood out. First, their AI drafting runs natively inside Word — the associates never leave the document. Second, they have a cross-matter risk dashboard that flags off-standard clauses across an entire matter, not one document at a time.
Nina Okafor: The cross-matter piece is what got the partners' attention. Right now our review is document-by-document, and for a firm our size that's a real time sink.
Priya Nair: Understood. Was pricing part of the pitch, or mostly product?
Marcus Bell: Mostly product, but they did float numbers — roughly 25% under what we're paying today, on a per-seat basis. Nothing formal in writing yet.
Nina Okafor: To be fair, they're a newer, smaller vendor. When we asked about their security posture — SOC 2, audit trails, data residency — the answers were vague. For a firm handling the matters we do, that's not optional.
Priya Nair: That's a fair concern to hold them to. On your side, what's keeping you with us today, honestly?
Marcus Bell: The integration has been dependable, and the associates are trained up on it — switching has a real cost. But "dependable and familiar" is getting harder to defend to the partners when the alternative is cheaper and demoing shiny features.
Devi Ramesh (Halden & Cross, Head of Innovation): I'll add — the associates genuinely liked the in-Word experience in the Verita demo. Less context switching. That message landed with the younger lawyers especially.
Priya Nair: Got it. So the three things I'm hearing: Word-native drafting, cross-matter risk analytics, and a lower price — with security maturity as the open question on their side.
Nina Okafor: That's a fair summary. We're not saying we're leaving. We're saying the status quo needs a reason, and the team wants me to pressure-test it.
Priya Nair: Completely reasonable. Let me ask about the cross-matter analytics specifically — is that a must-have for this renewal cycle, or a nice-to-have you're exploring?
Devi Ramesh: Trending toward must-have. Our clients are asking sharper questions about risk exposure across engagements, and anything that gets us ahead of that is climbing the priority list fast.
Marcus Bell: And procurement will lead with price. If the gap is 25%, that's a hard internal conversation regardless of how we feel about the product.
Priya Nair: Understood. How firm is the Verita timeline — are they pushing for a pilot?
Nina Okafor: They offered a 60-day pilot with two practice groups. We haven't accepted. I wanted to talk to you first.
Priya Nair: I appreciate that. What would a strong reason to renew and expand look like to the partners — is it matching on cross-matter analytics, the security story, total cost, or all three?
Devi Ramesh: Honestly, all three, but if I had to rank: credible cross-matter risk analytics first, then a total-cost story that closes most of that gap, then the security reassurance as table stakes.
Nina Okafor: I'd co-sign that ranking. The security piece is where you have an edge over a newer vendor — but only if it's substantiated, not just asserted.
Priya Nair: That's helpful and specific. Last thing — is there a hard decision date I should plan around?
Marcus Bell: The renewal is up end of September. Partners want a recommendation by the first week of September, so realistically we need to see something concrete within three to four weeks.
Priya Nair: Okay. That gives me a clear picture. Let me put together a response that speaks to the cross-matter analytics roadmap, a total-cost view against their number, and a substantiated security posture — and I'll get you something concrete inside three weeks.
Nina Okafor: That works. Be direct with us and we'll be direct with you. Thanks, Priya.
Priya Nair: Thank you all — I'll follow up by early next week to confirm next steps.`;

async function main() {
  const { supabaseServiceRole } = await import('../lib/supabase/server');
  const { runPipeline } = await import('../lib/pipeline/orchestrate');
  const { getProviderStatus } = await import('../lib/llm');

  console.log('Active provider:', JSON.stringify(await getProviderStatus()), '\n');

  const db = supabaseServiceRole();
  await db.from('competitors').upsert({ name: 'Verita AI' }, { onConflict: 'name' });

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
    for (const o of outs ?? []) {
      console.log(`\n--- [${o.audience}] ${o.output_type} ---\n${o.content}`);
    }

    const strip = (s: string) => s.replace(/\[rep to confirm[^\]]*\]/gi, ' ').toLowerCase();
    const sales = (outs ?? []).filter((o) => o.audience === 'sales');
    const bc = sales.find((o) => o.output_type === 'battlecard_snippet')?.content ?? '';
    const salesAll = sales.map((o) => o.content).join('\n');
    const mkt = (outs ?? []).filter((o) => o.audience === 'marketing').map((o) => o.content).join('\n');
    console.log('\n=== AUTO-CHECKS ===');
    console.log('Battlecard leads with Verita security weakness (good):', /(security|soc 2|audit trail|data residency|newer|smaller|unproven|vague)/i.test(bc));
    console.log('Sales soft-claims Litera CAN meet cross-matter need WITHOUT a note (bad):',
      /(we can (meet|address|offer|provide|deliver)|our solution (provides|delivers|addresses|offers))/i.test(strip(salesAll)));
    console.log('Sales uses a [Rep to confirm ...] note (good):', /\[rep to confirm/i.test(salesAll));
    console.log('Marketing names "Halden" (bad):', /halden/i.test(mkt));
  } catch (e) {
    console.error('\nPIPELINE ERROR:', e instanceof Error ? e.message : e);
  } finally {
    await db.from('signals').delete().eq('id', signal.id);
    console.log('\n(cleaned up)');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
