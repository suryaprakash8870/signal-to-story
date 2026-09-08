import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest } from '@/lib/supabase/server';
import { requireRole, RESEARCHERS } from '@/lib/auth/roles';

// Reads request state and live data, so it must never be statically
// evaluated at build time.
export const dynamic = 'force-dynamic';

// GET: list competitors with their known_facts (grounds Stage 3).
export async function GET() {
  // Matrix row 10 gives Admin, PMM and PM sight of the watchlist; only the
  // Admin may change it.
  const guard = await requireRole(RESEARCHERS);
  if (!guard.ok) return guard.response;

  const supabase = supabaseForRequest();
  const { data, error } = await supabase
    .from('competitors')
    .select('id, name, known_facts, tier, owner_id, created_at')
    .order('name', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ competitors: data });
}

// POST: create a competitor. Write is RLS-gated to reviewer/admin - a
// non-privileged caller's insert simply fails at the database.
export async function POST(req: NextRequest) {
  const guard = await requireRole(['admin']);
  if (!guard.ok) return guard.response;

  const supabase = supabaseForRequest();
  const { name } = await req.json();
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  const { data, error } = await supabase
    .from('competitors')
    .insert({ name: name.trim() })
    .select('id')
    .single();
  if (error) {
    const status = error.code === '23505' ? 409 : 403; // unique_violation → 409
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}
