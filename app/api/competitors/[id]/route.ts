import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest } from '@/lib/supabase/server';

// PATCH a competitor's tier (1 = Primary, 2 = Secondary, 3 = Watching, or null
// to unassign). RLS restricts the update to reviewer/admin. Tier is data only —
// no behaviour depends on it yet.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supabaseForRequest();
  const body = await req.json().catch(() => ({}));
  const { tier } = body as { tier?: number | null };
  if (tier !== null && ![1, 2, 3].includes(tier as number)) {
    return NextResponse.json({ error: 'tier must be 1, 2, 3, or null' }, { status: 400 });
  }
  const { error } = await supabase
    .from('competitors')
    .update({ tier, updated_at: new Date().toISOString() })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ ok: true });
}

// DELETE a competitor. RLS restricts this to reviewer/admin. A competitor
// still referenced by a signal_classification cannot be deleted (the FK has
// no cascade, by design — history is not destroyed); that returns a clear
// message rather than a raw constraint error.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supabaseForRequest();
  const { error } = await supabase.from('competitors').delete().eq('id', params.id);
  if (error) {
    if (error.code === '23503') {
      return NextResponse.json(
        { error: 'This competitor is referenced by existing signals and cannot be deleted.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
