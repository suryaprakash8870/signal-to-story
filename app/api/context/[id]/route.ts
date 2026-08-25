import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest } from '@/lib/supabase/server';
import { deleteContextDocument } from '@/lib/context/store';

/** DELETE a context document (its sections cascade). Reviewer/admin only. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
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

  try {
    await deleteContextDocument(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'delete failed' },
      { status: 500 }
    );
  }
}
