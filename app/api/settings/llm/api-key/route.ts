import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest, supabaseServiceRole } from '@/lib/supabase/server';
import { storeCredential } from '@/lib/connectors/vault';
import { detectProvider } from '@/lib/llm/config';

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
 * Stores an LLM API key in Vault. The provider is auto-detected from the key
 * format (sk-ant-… = Claude, AIza…/AQ.… = Gemini) — whichever key is given,
 * the pipeline uses that provider automatically; no key means Ollama. Keys are
 * stored in a single Vault slot ("llm_api_key"), so saving a new key OVERWRITES
 * the previous one in place — there is never more than one key on record. The
 * raw key is never logged, echoed, or returned.
 */
export async function POST(req: NextRequest) {
  const auth = await requireReviewerOrAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { value } = await req.json();
  if (typeof value !== 'string' || !value.trim()) {
    return NextResponse.json({ error: 'value (API key) is required' }, { status: 400 });
  }

  const provider = detectProvider(value);
  if (!provider) {
    return NextResponse.json(
      { error: 'Unrecognized key format. Claude keys start with "sk-ant-", Gemini keys with "AIza" or "AQ.".' },
      { status: 400 }
    );
  }

  const ref = await storeCredential('llm_api_key', value.trim());
  const db = supabaseServiceRole();
  const { error } = await db
    .from('llm_config')
    .update({ api_credentials_ref: ref, api_provider: provider, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, provider });
}

/** Removes the stored key, reverting the pipeline to Ollama. */
export async function DELETE() {
  const auth = await requireReviewerOrAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = supabaseServiceRole();
  const { error } = await db
    .from('llm_config')
    .update({ api_credentials_ref: null, api_provider: null, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
