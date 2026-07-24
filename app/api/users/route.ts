import { NextResponse } from 'next/server';
import { supabaseForRequest, supabaseServiceRole } from '@/lib/supabase/server';

// GET: list users who can own a competitor (reviewer/admin), with a display
// label (email, falling back to name). Reviewer/admin only. Used to populate the
// owner selector on the Competitors page. user_profiles has no email column, so
// emails are resolved from auth.users via the service role.
export async function GET() {
  const supabase = supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: me } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && me?.role !== 'reviewer') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const db = supabaseServiceRole();
  const { data: profiles } = await db
    .from('user_profiles')
    .select('id, full_name, role')
    .in('role', ['reviewer', 'admin']);

  const { data: list } = await db.auth.admin.listUsers();
  const emailById = new Map((list?.users ?? []).map((u) => [u.id, u.email]));

  const users = (profiles ?? []).map((p) => ({
    id: p.id,
    role: p.role,
    label: emailById.get(p.id) || p.full_name || p.id,
  }));
  return NextResponse.json({ users });
}
