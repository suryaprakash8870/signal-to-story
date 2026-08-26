import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest } from '@/lib/supabase/server';
import { runPipeline, rerunSignal, findExistingSignalByText } from '@/lib/pipeline/orchestrate';

// Reads request state and live data, so it must never be statically
// evaluated at build time.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json();
  const { raw_text, source_type, source_ref } = body ?? {};
  if (!raw_text || !source_type) {
    return NextResponse.json({ error: 'raw_text and source_type are required' }, { status: 400 });
  }

  const existing = await findExistingSignalByText(raw_text);
  if (existing) {
    // A prior run that ERRORED → re-run the full pipeline from scratch on this
    // same signal. A prior SUCCESSFUL run → dedupe (return it, no re-work).
    if (existing.status === 'error') {
      rerunSignal(existing.id).catch((err) => console.error('[pipeline] rerun error:', err));
      return NextResponse.json({ id: existing.id, rerun: true }, { status: 202 });
    }
    return NextResponse.json({ id: existing.id, deduped: true });
  }

  const { data, error } = await supabase
    .from('signals')
    .insert({ raw_text, source_type, source_ref, submitted_by: user.id })
    .select('id')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 });
  }

  // Fire the pipeline without blocking the response — the submitter watches
  // progress on /signals/[id] instead of waiting on this request.
  runPipeline(data.id).catch((err) => console.error('[pipeline] unhandled error:', err));

  return NextResponse.json({ id: data.id }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const supabase = supabaseForRequest();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const sourceType = searchParams.get('source_type');

  let query = supabase.from('signals').select('*').order('submitted_at', { ascending: false });
  if (status) query = query.eq('status', status);
  if (sourceType) query = query.eq('source_type', sourceType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ signals: data });
}
