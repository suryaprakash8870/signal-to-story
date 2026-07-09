import { NextResponse } from 'next/server';
import { supabaseForRequest } from '@/lib/supabase/server';
import { getProviderStatus } from '@/lib/llm';

/**
 * Reports which provider+location the pipeline will use right now (Claude,
 * Gemini, or remote/local Ollama with the model) and whether an API key is
 * stored. Never returns the key itself.
 */
export async function GET() {
  const supabase = supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { data } = await supabase
    .from('llm_config')
    .select('api_credentials_ref, api_provider')
    .eq('id', 1)
    .maybeSingle();

  const status = await getProviderStatus();
  return NextResponse.json({
    active_provider: status.provider, // 'claude' | 'gemini' | 'ollama'
    ollama_location: status.location ?? null,
    model: status.model ?? null,
    api_key_set: !!data?.api_credentials_ref,
    api_provider: data?.api_provider ?? null,
  });
}
