import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest } from '@/lib/supabase/server';

// PATCH a competitor's tier and/or owner. Only the fields present in the body
// are updated. tier: 1=Primary, 2=Secondary, 3=Watching, or null to unassign.
// owner_id: a user id, or null to unassign. RLS restricts the update to
// reviewer/admin. Tier is data only; owner drives notification + approval.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supabaseForRequest();
  const body = (await req.json().catch(() => ({}))) as {
    tier?: number | null;
    owner_id?: string | null;
  };

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ('tier' in body) {
    if (body.tier !== null && ![1, 2, 3].includes(body.tier as number)) {
      return NextResponse.json({ error: 'tier must be 1, 2, 3, or null' }, { status: 400 });
    }
    update.tier = body.tier;
  }
  if ('owner_id' in body) {
    if (body.owner_id !== null && typeof body.owner_id !== 'string') {
      return NextResponse.json({ error: 'owner_id must be a user id or null' }, { status: 400 });
    }
    update.owner_id = body.owner_id;
  }

  const { error } = await supabase.from('competitors').update(update).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ ok: true });
}

// DELETE a competitor. RLS restricts this to reviewer/admin. A competitor
// still referenced by a signal_classification cannot be deleted (the FK has
// no cascade, by design - history is not destroyed); that returns a clear
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
