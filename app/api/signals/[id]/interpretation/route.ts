import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest, supabaseServiceRole } from '@/lib/supabase/server';

// PATCH the reviewer-editable "what to do next" recommendation on a signal's
// stored interpretation. Reviewer/admin only (checked here, then written via the
// service role since signals has no user-facing UPDATE policy - the pipeline
// also writes signals via the service role). Only the what_to_do_next field is
// touched; signal_summary and why_it_matters are left as generated.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin' && profile?.role !== 'reviewer') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { what_to_do_next } = await req.json();
  if (typeof what_to_do_next !== 'string') {
    return NextResponse.json({ error: 'what_to_do_next must be a string' }, { status: 400 });
  }

  const db = supabaseServiceRole();
  const { data: sig, error: readErr } = await db
    .from('signals')
    .select('interpretation')
    .eq('id', params.id)
    .single();
  if (readErr || !sig) {
    return NextResponse.json({ error: readErr?.message ?? 'not found' }, { status: 404 });
  }

  const interpretation = { ...(sig.interpretation ?? {}), what_to_do_next };
  const { error } = await db
    .from('signals')
    .update({ interpretation })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
