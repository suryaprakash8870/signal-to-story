import { NextResponse } from 'next/server';
import { supabaseForRequest, supabaseServiceRole } from '@/lib/supabase/server';

// Reads request state and live data, so it must never be statically
// evaluated at build time.
export const dynamic = 'force-dynamic';

/**
 * Powers the notification badge (sidebar), bell (header), and dashboard banner.
 *
 * A signal is "notifiable" from the moment it starts being processed until the
 * reviewer has handled it. That's the union of:
 *   1. signals still IN FLIGHT — status in ('classified','interpreted') — so a
 *      freshly-detected signal shows up within seconds, not only after the full
 *      ~35s pipeline finishes; and
 *   2. signals AWAITING REVIEW — at least one output still approved=false AND
 *      published_at is null.
 * Once every output is approved/published (or the signal is rejected), it drops
 * out here — which is why the badge clears itself after review. The per-browser
 * "seen" filter (useNotifications) then hides ones the reviewer has opened.
 */
export async function GET() {
  const supabase = supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ count: 0, signals: [] });

  const db = supabaseServiceRole();

  // (1) Signals that still need the PMM: pending processing ('draft') or being
  // generated right now ('classified'/'interpreted').
  const { data: inFlight } = await db
    .from('signals')
    .select('id')
    .in('status', ['draft', 'classified', 'interpreted']);

  // (2) Signals with outputs still waiting on the reviewer.
  const { data: pending } = await db
    .from('signal_outputs')
    .select('signal_id')
    .eq('approved', false)
    .is('published_at', null);

  const signalIds = Array.from(
    new Set([
      ...(inFlight ?? []).map((r) => r.id),
      ...(pending ?? []).map((r) => r.signal_id),
    ])
  );
  if (signalIds.length === 0) return NextResponse.json({ count: 0, signals: [] });

  const { data: signals } = await db
    .from('signals')
    .select('id, source_type, status, submitted_at')
    .in('id', signalIds)
    .order('submitted_at', { ascending: false });

  const { data: classifications } = await db
    .from('signal_classification')
    .select('signal_id, competitor_id, urgency')
    .in('signal_id', signalIds);

  const compIds = Array.from(
    new Set((classifications ?? []).map((c) => c.competitor_id).filter(Boolean))
  ) as string[];
  const { data: comps } = compIds.length
    ? await db.from('competitors').select('id, name').in('id', compIds)
    : { data: [] as { id: string; name: string }[] };
  const compName = new Map((comps ?? []).map((c) => [c.id, c.name]));
  const byClass = new Map((classifications ?? []).map((c) => [c.signal_id, c]));

  const out = (signals ?? []).map((s) => {
    const c = byClass.get(s.id);
    const processing = s.status === 'classified' || s.status === 'interpreted';
    return {
      signalId: s.id,
      competitor: c?.competitor_id ? compName.get(c.competitor_id) ?? null : null,
      urgency: c?.urgency ?? 'medium',
      sourceType: s.source_type,
      createdAt: s.submitted_at,
      processing,
    };
  });

  return NextResponse.json({ count: out.length, signals: out });
}
