import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest, supabaseServiceRole } from '@/lib/supabase/server';

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

  const { error: approveErr } = await supabase
    .from('signal_outputs')
    .update({ reviewed_by: user.id, reviewed_at: new Date().toISOString(), rejected: true })
    .eq('id', params.id);
  if (approveErr) return NextResponse.json({ error: approveErr.message }, { status: 500 });

  // signals.status update is a pipeline-level transition, not user input —
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
