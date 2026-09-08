import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest, supabaseServiceRole } from '@/lib/supabase/server';
import { DENIED_MESSAGE } from '@/lib/auth/roles';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { data: output, error: outputErr } = await supabase
    .from('signal_outputs')
    .select('signal_id')
    .eq('id', params.id)
    .single();
  if (outputErr || !output) {
    return NextResponse.json({ error: outputErr?.message ?? 'not found' }, { status: 404 });
  }

  // See the approve route: a policy-blocked update is silent, so ask for the
  // changed rows back and treat "none" as the refusal it is.
  const { data: updated, error: approveErr } = await supabase
    .from('signal_outputs')
    .update({ reviewed_by: user.id, reviewed_at: new Date().toISOString(), rejected: true })
    .eq('id', params.id)
    .select('id');
  if (approveErr) return NextResponse.json({ error: approveErr.message }, { status: 500 });
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: DENIED_MESSAGE }, { status: 403 });
  }

  // signals.status update is a pipeline-level transition, not user input -
  // per 01-DATA-MODEL.md this goes through the service role, same as the
  // pipeline stages themselves.
  const db = supabaseServiceRole();
  const { error: statusErr } = await db
    .from('signals')
    .update({ status: 'rejected' })
    .eq('id', output.signal_id);
  if (statusErr) return NextResponse.json({ error: statusErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
