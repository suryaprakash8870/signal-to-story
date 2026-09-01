import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest, supabaseServiceRole } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * POST: record whether a relevance note was useful.
 *
 * This is the only ongoing measure of note quality. Accuracy was established by
 * reviewing a handful of cases by hand, which does not scale and says nothing
 * about how the tool behaves as the competitor list grows. A reader marking a
 * note as useful or not is cheap to give and is what makes quality trackable
 * rather than assumed.
 *
 * Sending the same value twice clears it, so a misclick is undoable.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const value = Number(body?.value);
  if (value !== 1 && value !== -1) {
    return NextResponse.json({ error: 'value must be 1 or -1' }, { status: 400 });
  }

  const db = supabaseServiceRole();
  const { data: existing, error: readErr } = await db
    .from('competitor_updates')
    .select('id, note_feedback')
    .eq('id', params.id)
    .maybeSingle();
  if (readErr || !existing) {
    return NextResponse.json({ error: 'update not found' }, { status: 404 });
  }

  // Clicking the same judgement again withdraws it.
  const next = existing.note_feedback === value ? null : value;

  const { error } = await db
    .from('competitor_updates')
    .update({
      note_feedback: next,
      note_feedback_at: next === null ? null : new Date().toISOString(),
      note_feedback_by: next === null ? null : user.id,
    })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, value: next });
}
