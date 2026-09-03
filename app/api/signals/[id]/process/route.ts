import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest, supabaseServiceRole } from '@/lib/supabase/server';
import { runPipeline, rerunSignal } from '@/lib/pipeline/orchestrate';

/**
 * Manually run the pipeline for a PENDING signal (e.g. one pulled from Crayon
 * that was not auto-processed). Fires the pipeline without blocking the response
 * - the caller watches progress on /signals/[id]. Only signals that have not
 * been processed ('draft') or that errored ('error') can be processed here;
 * an already-packaged signal is left alone to avoid duplicate outputs.
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
    return NextResponse.json({ error: 'signal not found' }, { status: 404 });
  }

  if (signal.status === 'draft') {
    runPipeline(signal.id).catch((e) => console.error('[pipeline] process error:', e));
  } else if (signal.status === 'error') {
    // Errored → clear any partial outputs and re-run from scratch.
    rerunSignal(signal.id).catch((e) => console.error('[pipeline] reprocess error:', e));
  } else {
    return NextResponse.json(
      { error: `Signal is already ${signal.status} - nothing to process.` },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, processing: true });
}
