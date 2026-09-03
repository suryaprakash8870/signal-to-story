import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest } from '@/lib/supabase/server';

/**
 * Blocked by RLS if unverified_claims is non-empty (01-DATA-MODEL.md's
 * `with check` clause) - this route does not duplicate that check, it
 * relies on the database to enforce it and surfaces the resulting error.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { error } = await supabase
    .from('signal_outputs')
    .update({ approved: true, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', params.id);

  if (error) {
    return NextResponse.json(
      { error: 'Resolve flagged claims before approving.', detail: error.message },
      { status: 403 }
    );
  }
  return NextResponse.json({ ok: true });
}
