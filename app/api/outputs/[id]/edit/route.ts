import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest } from '@/lib/supabase/server';
import { DENIED_MESSAGE } from '@/lib/auth/roles';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supabaseForRequest();
  const { content } = await req.json();
  if (typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  // Read current edit_count to increment it, and stamp edited_at - this is the
  // data source for the approval/edit-rate metric (Phase 3).
  const { data: current } = await supabase
    .from('signal_outputs')
    .select('edit_count')
    .eq('id', params.id)
    .single();

  const { data: updated, error } = await supabase
    .from('signal_outputs')
    .update({
      content,
      edited_at: new Date().toISOString(),
      edit_count: (current?.edit_count ?? 0) + 1,
    })
    .eq('id', params.id)
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Editing a recommendation is a PMM capability in Dale's matrix, enforced by
  // the same ownership policy as approval. Zero rows means it was refused.
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: DENIED_MESSAGE }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
