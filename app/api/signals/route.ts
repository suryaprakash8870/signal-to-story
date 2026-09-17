import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest } from '@/lib/supabase/server';
import { DISTRIBUTORS, requireRole } from '@/lib/auth/roles';
import { runPipeline, rerunSignal, findExistingSignalByText } from '@/lib/pipeline/orchestrate';

// Reads request state and live data, so it must never be statically
// evaluated at build time.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const guard = await requireRole(DISTRIBUTORS);
  if (!guard.ok) return guard.response;
  const supabase = supabaseForRequest();

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
    .insert({ raw_text, source_type, source_ref, submitted_by: guard.actor.id })
    .select('id')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 });
  }

  // Fire the pipeline without blocking the response - the submitter watches
  // progress on /signals/[id] instead of waiting on this request.
  runPipeline(data.id).catch((err) => console.error('[pipeline] unhandled error:', err));

  return NextResponse.json({ id: data.id }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const guard = await requireRole(DISTRIBUTORS);
  if (!guard.ok) return guard.response;
  const supabase = supabaseForRequest();
  // Row-level security already prevents a signed-out caller from reading any
  // rows, so this is not the thing keeping the data safe. It is here so the
  // caller is told they are signed out, rather than being handed an empty list
  // that looks like "there is nothing here". The POST handlers alongside these
  // have always checked; the GETs did not, and the inconsistency showed.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const sourceType = searchParams.get('source_type');

  let query = supabase.from('signals').select('*').order('submitted_at', { ascending: false });
  if (status) query = query.eq('status', status);
  if (sourceType) query = query.eq('source_type', sourceType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const signals = data ?? [];
  const ids = signals.map((s) => s.id);

  // What used to be the separate Review queue: how much of each signal is still
  // waiting, and how urgent it is. It lives here because both pages ended at
  // the same place - every row on Review was a link to /signals/[id] - and the
  // two screens counted the same work differently, one per artefact and one per
  // signal, so "87 pending" and "6 pending" described the same fifteen items.
  //
  // Counted by AUDIENCE, not by artefact. The signal page groups its cards by
  // team, and a count that disagrees with what the page then shows is worse
  // than no count.
  const [{ data: pending }, { data: classifications }] = await Promise.all([
    supabase
      .from('signal_outputs')
      .select('signal_id, audience, unverified_claims')
      .in('signal_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
      .eq('approved', false)
      .eq('rejected', false)
      .is('published_at', null),
    supabase
      .from('signal_classification')
      .select('signal_id, urgency')
      .in('signal_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
  ]);

  const teams = new Map<string, Set<string>>();
  const unverified = new Set<string>();
  for (const row of pending ?? []) {
    if (!teams.has(row.signal_id)) teams.set(row.signal_id, new Set());
    teams.get(row.signal_id)!.add(row.audience);
    if ((row.unverified_claims ?? []).length > 0) unverified.add(row.signal_id);
  }
  const urgencyBySignal = new Map((classifications ?? []).map((c) => [c.signal_id, c.urgency]));

  return NextResponse.json({
    signals: signals.map((s) => ({
      ...s,
      urgency: urgencyBySignal.get(s.id) ?? null,
      pendingTeams: teams.get(s.id)?.size ?? 0,
      unverified: unverified.has(s.id),
    })),
  });
}
