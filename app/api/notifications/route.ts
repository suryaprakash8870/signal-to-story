import { NextResponse } from 'next/server';
import { supabaseForRequest, supabaseServiceRole } from '@/lib/supabase/server';

/**
 * Powers the notification badge (sidebar), the bell (header), and the
 * dashboard banner. "Awaiting review" is derived from the same basis as the
 * review queue — signals that still have at least one output pending review
 * (approved = false AND published_at is null). No separate notifications
 * table: once a signal is reviewed/approved/published it drops out here, which
 * is exactly why the badge clears itself after review.
 */
export async function GET() {
  const supabase = supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ count: 0, signals: [] });

  const db = supabaseServiceRole();

  // Outputs still waiting on the reviewer.
  const { data: pending } = await db
    .from('signal_outputs')
    .select('signal_id')
    .eq('approved', false)
    .is('published_at', null);

  const signalIds = Array.from(new Set((pending ?? []).map((r) => r.signal_id)));
  if (signalIds.length === 0) return NextResponse.json({ count: 0, signals: [] });

  // Signal + classification context for each pending signal.
  const { data: signals } = await db
    .from('signals')
    .select('id, source_type, submitted_at')
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
    return {
      signalId: s.id,
      competitor: c?.competitor_id ? compName.get(c.competitor_id) ?? null : null,
      urgency: c?.urgency ?? 'medium',
      sourceType: s.source_type,
      createdAt: s.submitted_at,
    };
  });

  return NextResponse.json({ count: out.length, signals: out });
}
