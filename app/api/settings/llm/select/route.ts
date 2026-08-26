import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest, supabaseServiceRole } from '@/lib/supabase/server';

/**
 * Pins the pipeline to a specific backend (from the settings dropdown), or
 * 'auto' to clear the pin. Reviewer/admin only. Value is one of:
 *   'auto' | 'api' | 'ollama|<baseUrl>|<model>'
 */
export async function POST(req: NextRequest) {
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

  const { backend } = await req.json();
  if (typeof backend !== 'string' || !backend) {
    return NextResponse.json({ error: 'backend is required' }, { status: 400 });
  }
  const valid =
    backend === 'auto' ||
    backend === 'api' ||
    backend === 'cloudflare' ||
    backend === 'litera' ||
    backend === 'gemini-entra' ||
    backend.startsWith('ollama|');
  if (!valid) return NextResponse.json({ error: 'invalid backend value' }, { status: 400 });

  // Store null for 'auto' so absence means auto.
  const value = backend === 'auto' ? null : backend;
  const db = supabaseServiceRole();
  const { error } = await db
    .from('llm_config')
    .update({ selected_backend: value, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, selected: backend });
}
