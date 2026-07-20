import { NextResponse } from 'next/server';
import { supabaseForRequest, supabaseServiceRole } from '@/lib/supabase/server';
import { sendReviewNotification, getPmmRecipients } from '@/lib/email/review-notification';

// A small rotation of realistic competitive signals, so repeated triggers look
// like genuinely different detections (not the same alert four times). Each is
// grounded and self-contained so its outputs are approvable end to end.
const DEMO_SIGNALS: { competitor: string; text: string }[] = [
  {
    competitor: 'Harvey AI',
    text:
      'Harvey AI announced "Harvey for Transactions," a new agentic AI module that ' +
      'drafts and reviews M&A transaction documents end to end, and named three ' +
      'AmLaw 100 firms as launch customers. Harvey also disclosed a $300M Series E ' +
      'funding round. The announcement positions Harvey as moving beyond legal ' +
      "research into document drafting and deal workflows — directly overlapping " +
      "Litera's transaction management and drafting products.",
  },
  {
    competitor: 'Luminance',
    text:
      'Luminance launched "Luminance Diligence," an AI contract-review tool that ' +
      'auto-flags risk clauses across large document sets, and published a case ' +
      'study claiming a 70% reduction in review time at a UK law firm. The launch ' +
      "targets due-diligence workflows that overlap Litera's document-review offering.",
  },
  {
    competitor: 'Ironclad',
    text:
      'Ironclad released an AI "Contract Copilot" that drafts first-pass agreements ' +
      'from a plain-language prompt and integrates natively with Salesforce. Ironclad ' +
      'framed it as moving upmarket into law-firm workflows, not just in-house legal ' +
      'ops — a segment where Litera is strong.',
  },
  {
    competitor: 'Robin AI',
    text:
      'Robin AI announced a partnership with a top-10 global law firm and a new ' +
      'clause-library product that suggests firm-approved language while drafting. ' +
      'The move pushes Robin AI further into the drafting and knowledge-management ' +
      "space Litera serves.",
  },
];

// Deterministic-enough pick without Math.random: rotate by wall-clock second.
function pickSignal() {
  const idx = new Date().getSeconds() % DEMO_SIGNALS.length;
  return DEMO_SIGNALS[idx];
}

/**
 * Manual demo trigger (reached only via the hidden /trigger page). Simulates
 * "Compete Agent detected a new competitive signal": stages ONE new PENDING
 * signal (status 'draft') and emails the PMM a Review Signal notification.
 *
 * It deliberately does NOT run the pipeline — the AI is only called when the
 * PMM clicks Process on the specific signal they want (POST /api/signals/:id/
 * process). This keeps AI usage to what's actually reviewed instead of firing
 * a full pipeline for every triggered signal.
 */
export async function POST() {
  const supabase = supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const db = supabaseServiceRole();
  const pick = pickSignal();

  // Make sure the competitor exists so classification can match + ground it.
  await db.from('competitors').upsert({ name: pick.competitor }, { onConflict: 'name' });

  const { data: signal, error } = await db
    .from('signals')
    .insert({ raw_text: pick.text, source_type: 'crayon', source_ref: 'trigger' })
    .select('id')
    .single();
  if (error || !signal) {
    return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 });
  }

  // No pipeline here — the signal stays 'draft' (pending) until the PMM
  // processes it. Email the PMM. Await so we can report whether it actually sent.
  let emailed: string[] = [];
  let emailError: string | null = null;
  try {
    emailed = await sendReviewNotification({
      signalId: signal.id,
      competitor: pick.competitor,
      urgency: 'high',
      excerpt: pick.text.slice(0, 180),
    });
  } catch (e) {
    emailError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({
    ok: true,
    signalId: signal.id,
    competitor: pick.competitor,
    emailed,
    recipients: getPmmRecipients(),
    emailError,
  });
}
