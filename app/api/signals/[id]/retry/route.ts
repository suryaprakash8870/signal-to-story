import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest, supabaseServiceRole } from '@/lib/supabase/server';
import { runPipeline } from '@/lib/pipeline/orchestrate';

/**
 * Re-runs the pipeline for a signal that errored or got stuck (e.g. the dev
 * server was restarted mid-run, orphaning it at 'classified'/'interpreted').
 * Clears any partial outputs first so a retry can't duplicate rows, resets
 * status to 'draft', then re-runs Stages 2–5.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const db = supabaseServiceRole();
  const { data: signal, error } = await db
    .from('signals')
    .select('id, status')
    .eq('id', params.id)
    .maybeSingle();
  if (error || !signal) {
    return NextResponse.json({ error: error?.message ?? 'not found' }, { status: 404 });
  }

  // Don't re-run something already fully processed and acted on.
  if (['published'].includes(signal.status)) {
    return NextResponse.json({ error: `signal is ${signal.status}; nothing to retry` }, { status: 409 });
  }

  // Clear partial outputs from the prior attempt (classification is upserted
  // by the pipeline so it doesn't need clearing).
  await db.from('signal_outputs').delete().eq('signal_id', params.id);
  await db.from('signals').update({ status: 'draft' }).eq('id', params.id);

  runPipeline(params.id).catch((e) => console.error('[pipeline] retry error:', e));

  return NextResponse.json({ ok: true, retrying: params.id });
}
