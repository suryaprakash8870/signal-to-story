/**
 * Re-run the comprehensive Wexley & Hart / Nexdraft call after the framework +
 * code-guard changes. Verifies all 6 invariants hold.
 *
 * Run:  npx tsx scripts/wexley-retest.ts
 */
import { readFileSync } from 'fs';
import path from 'path';
for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const SIGNAL = `[Gong Call - FY26 Renewal & Expansion Review: Wexley & Hart LLP × Litera - 2026-07-08]

Priya Nair (Litera, Account Executive): Thanks for making time, everyone. This is our renewal and expansion check-in, and I know the innovation group had a few things to put on the table, so let's be candid.
Diane Wexley (Wexley & Hart, Managing Partner): Appreciate it, Priya. The platform's been solid this year - adoption is good. But I'll be direct: we've been evaluating Nexdraft AI, and the partners want it on the record before we sign another term.
Priya Nair: I'd rather hear it straight. What prompted the Nexdraft look?
Sam Okoro (Wexley & Hart, Head of Knowledge Management): A few things. On product, two features stood out in their demo - their drafting runs natively inside Word so associates never leave the document, and they have a cross-matter clause analytics view that flags off-standard language across a whole matter, not one doc at a time.
Diane Wexley: The cross-matter piece is what caught the partners. Today our review is document-by-document, and at our size that's a real time sink.
Priya Nair: Understood. Was pricing part of it?
Sam Okoro: They floated numbers - roughly 20% under our current spend, per seat. Nothing formal in writing yet, and procurement will absolutely lead with that number.
Diane Wexley: To be fair, Nexdraft is a newer, smaller vendor. When we pushed on security - SOC 2, audit trails, data residency - the answers were vague. For the matters we handle, that's not optional.
Ravi Menon (Wexley & Hart, Director of Legal Ops): And honestly, a lot of the demo was aspirational. When we dug in, the product didn't fully back the pitch. But the pitch is landing anyway.
Priya Nair: Say more about the pitch landing.
Ravi Menon: They're everywhere on the marketing side. A keynote at LegalTech last month, a "State of AI in Legal" report our partners are forwarding around, and a relentless "AI-first drafting" campaign on LinkedIn. It's shaping how the partners talk about the whole category.
Diane Wexley: That's the part that worries me most - not the tech, the narrative. When partners start repeating a competitor's tagline in meetings, that's a problem for whoever they're comparing you to.
Priya Nair: Fair. Is the cross-matter analytics a must-have for this cycle, or exploratory?
Sam Okoro: Trending to must-have. Our clients are asking sharper questions about risk exposure across engagements, and getting ahead of that is climbing the list fast.
Priya Nair: And what's keeping you with us today, honestly?
Diane Wexley: The integration's been dependable and the associates are trained up - switching has a real cost. But "dependable and familiar" is getting harder to defend to partners against something cheaper with a louder story.
Priya Nair: Understood. Are you running a Nexdraft pilot?
Ravi Menon: They offered a 60-day pilot with two practice groups. We haven't accepted - we wanted to talk to you first.
Priya Nair: I appreciate that. If you had to rank what would make renewing-and-expanding an easy yes to the partners?
Diane Wexley: One, credible cross-matter risk analytics. Two, a total-cost story that closes most of that 20% gap. Three, a substantiated security position - which is where you should have an edge over a newer vendor, but only if it's proven, not asserted.
Priya Nair: That's specific and helpful. Any hard dates?
Ravi Menon: Renewal's end of September. Partners want a recommendation the first week of September, so we need something concrete within three to four weeks.
Priya Nair: Got it. Let me come back with a point of view on cross-matter analytics, a total-cost view against their number, and a substantiated security story - and an outcomes-led narrative, not just an AI checkbox.
Diane Wexley: That's the right framing. Be direct with us and we'll be direct with you.
Priya Nair: Thank you all - I'll follow up early next week with next steps.`;

async function main() {
  const { supabaseServiceRole } = await import('../lib/supabase/server');
  const { runPipeline } = await import('../lib/pipeline/orchestrate');
  const { getProviderStatus } = await import('../lib/llm');

  console.log('Active provider:', JSON.stringify(await getProviderStatus()), '\n');
  const db = supabaseServiceRole();
  // Ensure the matched competitor + a couple of OTHER competitors exist, so the
  // entity-bleed guard has foreign names to block.
  for (const name of ['Nexdraft AI', 'Verita AI', 'Clarive']) {
    await db.from('competitors').upsert({ name }, { onConflict: 'name' });
  }

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
      .select('signal_type, urgency, audience_relevance')
      .eq('signal_id', signal.id)
      .maybeSingle();
    console.log('Classification:', JSON.stringify(cls));

    const { data: outs } = await db
      .from('signal_outputs')
      .select('audience, output_type, content')
      .eq('signal_id', signal.id);

    console.log(`\n=== ${outs?.length ?? 0} OUTPUTS ===`);
    for (const o of outs ?? []) console.log(`\n--- [${o.audience}] ${o.output_type} ---\n${o.content}`);

    const all = (outs ?? []).map((o) => o.content).join('\n');
    const stripNotes = (s: string) => s.replace(/\[rep note[^\]]*\]/gi, ' ').toLowerCase();
    const asserted = stripNotes(all);
    const mkt = (outs ?? []).filter((o) => o.audience === 'marketing').map((o) => o.content).join('\n').toLowerCase();
    const prod = (outs ?? []).filter((o) => o.audience === 'product').map((o) => o.content).join('\n').toLowerCase();

    void asserted;
    const internal = (outs ?? []).filter((o) => o.output_type !== 'talk_track').map((o) => o.content).join('\n');
    console.log('\n=== INVARIANT CHECKS ===');
    console.log('1. Foreign competitor (Verita/Clarive) anywhere (BAD):', /verita|clarive/i.test(all));
    console.log('2. ASSERTS a Litera capability (BAD):', /(litera (provides|offers|holds|has|delivers|is certified)|our (soc 2|audit trails?|security posture|track record|certification)|we (provide|offer|hold|deliver)[^.]*?(soc 2|audit|security|analytics))/i.test(all));
    console.log('3. Still emits bracket flags [Rep note/confirm] (BAD now):', /\[rep (note|to confirm)/i.test(all));
    console.log('4a. Marketing names "Wexley" (BAD):', /wexley/i.test(mkt));
    console.log('4b. Marketing has account/pricing tactics (BAD):', /(their budget|pricing strategy|the account|60-day pilot|renewal)/i.test(mkt));
    console.log('5. Product self-contradiction (gap + "no implication") (BAD):', /no (direct )?product implication/i.test(prod) && /(gap|cross-matter)/i.test(prod));
    console.log('6. Invents a Nexdraft price ($ number) (BAD):', /\$\s?\d/.test(all));
    console.log('7. Internal outputs (not talk_track) say "you" (BAD):', /\byou(r)?\b/i.test(internal));
    console.log('8. Reports the client\'s ask as info (GOOD):', /(client|firm)[^.]*(asked|raised|wants|needs|values|requires|is asking)/i.test(all));
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
