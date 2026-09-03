import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest } from '@/lib/supabase/server';

// PATCH connector mode / config / cadence. Admin-only write is enforced by
// the connectors RLS policy (01-DATA-MODEL.md) - the session client below
// is subject to it, so a non-admin update simply fails at the database.
export async function PATCH(req: NextRequest, { params }: { params: { type: string } }) {
  const supabase = supabaseForRequest();
  const body = await req.json();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.mode !== undefined) patch.mode = body.mode;
  if (body.config !== undefined) patch.config = body.config;
  if (body.cadence !== undefined) patch.cadence = body.cadence;

  const { error } = await supabase
    .from('connectors')
    .update(patch)
    .eq('type', params.type);
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ ok: true });
}
