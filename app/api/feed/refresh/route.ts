import { NextResponse } from 'next/server';
import { supabaseForRequest } from '@/lib/supabase/server';
import { ingestCompetitorUpdates } from '@/lib/feed/ingest';

/**
 * POST: pull the latest Crayon Sparks and store the individual updates inside
 * them. Deduped, so calling this repeatedly only adds genuinely new updates.
 * Reviewer/admin only.
 */
export async function POST() {
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
    const result = await ingestCompetitorUpdates();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'refresh failed' },
      { status: 500 }
    );
  }
}
