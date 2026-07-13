import { NextResponse } from 'next/server';
import { supabaseForRequest, supabaseServiceRole } from '@/lib/supabase/server';
import { runPipeline } from '@/lib/pipeline/orchestrate';
import { sendReviewNotification, getPmmRecipients } from '@/lib/email/review-notification';

// Demo signal the trigger stages. Grounded and self-contained so the outputs
// are approvable end-to-end (matches the Harvey demo used elsewhere).
const DEMO_COMPETITOR = 'Harvey AI';
const DEMO_SIGNAL =
  'Harvey AI announced "Harvey for Transactions," a new agentic AI module that ' +
  'drafts and reviews M&A transaction documents end to end, and named three ' +
  'AmLaw 100 firms as launch customers. Harvey also disclosed a $300M Series E ' +
  'funding round. The announcement positions Harvey as moving beyond legal ' +
  "research into document drafting and deal workflows — directly overlapping " +
  "Litera's transaction management and drafting products.";

/**
 * Manual demo trigger (reached only via the hidden /trigger page). Simulates
 * "Compete Agent detected a new competitive signal": stages a fresh signal,
 * runs the real pipeline (fire-and-forget), and emails the PMM a
 * Review Signal notification. The in-app badge/bell/banner pick the signal up
 * once packaging completes (see /api/notifications).
 */
export async function POST() {
  const supabase = supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const db = supabaseServiceRole();

  // Keep the count sane across repeated demo triggers: clear any prior
  // trigger-created signals that are not yet published/rejected.
  const { data: priors } = await db
    .from('signals')
    .select('id')
    .eq('source_ref', 'trigger')
    .not('status', 'in', '("published","rejected")');
  for (const p of priors ?? []) {
    await db.from('signal_outputs').delete().eq('signal_id', p.id);
    await db.from('signals').delete().eq('id', p.id);
  }

  // Make sure the competitor exists so classification can match + ground it.
  await db.from('competitors').upsert({ name: DEMO_COMPETITOR }, { onConflict: 'name' });

  const { data: signal, error } = await db
    .from('signals')
    .insert({ raw_text: DEMO_SIGNAL, source_type: 'crayon', source_ref: 'trigger' })
    .select('id')
    .single();
  if (error || !signal) {
    return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 });
  }

  // Run the real pipeline in the background; the notification badge appears
  // when it reaches 'packaged'.
  runPipeline(signal.id).catch((e) => console.error('[trigger] pipeline error:', e));

  // Email the PMM. Await so we can report whether the email actually sent.
  let emailed: string[] = [];
  let emailError: string | null = null;
  try {
    emailed = await sendReviewNotification({
      signalId: signal.id,
      competitor: DEMO_COMPETITOR,
      urgency: 'high',
      excerpt: DEMO_SIGNAL.slice(0, 180),
    });
  } catch (e) {
    emailError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({
    ok: true,
    signalId: signal.id,
    emailed,
    recipients: getPmmRecipients(),
    emailError,
  });
}
