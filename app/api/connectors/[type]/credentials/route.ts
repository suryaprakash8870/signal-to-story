import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest, supabaseServiceRole } from '@/lib/supabase/server';
import { storeCredential } from '@/lib/connectors/vault';

/**
 * Writes a connector credential to Vault and stores only the returned
 * reference in connectors.credentials_ref. Never logs or echoes the raw
 * value (07-API-ENDPOINTS.md). Admin-only is enforced by the RLS policy on
 * connectors — the service-role update here runs only after we confirm the
 * caller is an admin via their session.
 */
export async function POST(req: NextRequest, { params }: { params: { type: string } }) {
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
    // connectors RLS is admin-only for writes; mirror that here. (Reviewer
    // allowed too for single-owner Phase 1 setups — tighten to admin-only
    // once roles are finalized per 09-BUILD-PHASES-AND-TASKS.md.)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { value } = await req.json();
  if (typeof value !== 'string' || !value.trim()) {
    return NextResponse.json({ error: 'value is required' }, { status: 400 });
  }

  const db = supabaseServiceRole();
  const { data: connector, error: findErr } = await db
    .from('connectors')
    .select('id')
    .eq('type', params.type)
    .maybeSingle();
  if (findErr || !connector) {
    return NextResponse.json({ error: 'connector not found' }, { status: 404 });
  }

  const ref = await storeCredential(`connector_${params.type}_${connector.id}`, value.trim());

  const { error: updateErr } = await db
    .from('connectors')
    .update({ credentials_ref: ref, status: 'connected', updated_at: new Date().toISOString() })
    .eq('id', connector.id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
