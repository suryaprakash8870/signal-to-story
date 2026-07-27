import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest, supabaseServiceRole } from '@/lib/supabase/server';

async function requireReviewerOrAdmin() {
  const supabase = supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated', status: 401 as const };
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin' && profile?.role !== 'reviewer') {
    return { error: 'forbidden', status: 403 as const };
  }
  return { user };
}

/**
 * Saves the Litera Entra access token (stored on llm_config.litera_token; the
 * pipeline reads it before the env fallback). The token is validated with a
 * live call BEFORE it is saved, so an expired or mangled token (e.g. one that
 * merged with pasted text) is rejected immediately rather than failing later
 * mid-pipeline. The raw token is never logged or returned.
 */
export async function POST(req: NextRequest) {
  const auth = await requireReviewerOrAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { token } = await req.json();
  if (typeof token !== 'string' || !token.trim()) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 });
  }
  const clean = token.trim();

  const endpoint = process.env.LITERA_API_URL;
  if (!endpoint) {
    return NextResponse.json({ error: 'LITERA_API_URL is not configured on the server.' }, { status: 400 });
  }

  // Validate with a live call before saving.
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clean}` },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }] }),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 401) {
      return NextResponse.json(
        { error: 'Token rejected (401) — it may be expired or incomplete. Paste a fresh token.' },
        { status: 400 }
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return NextResponse.json(
        { error: `Litera returned ${res.status}. ${body.slice(0, 160)}` },
        { status: 400 }
      );
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Could not reach Litera to validate the token: ${e instanceof Error ? e.message : String(e)}` },
      { status: 400 }
    );
  }

  const db = supabaseServiceRole();
  const { error } = await db
    .from('llm_config')
    .update({ litera_token: clean, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, validated: true });
}

/** Clears the stored Litera token (reverts to the env fallback, if any). */
export async function DELETE() {
  const auth = await requireReviewerOrAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const db = supabaseServiceRole();
  const { error } = await db
    .from('llm_config')
    .update({ litera_token: null, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
