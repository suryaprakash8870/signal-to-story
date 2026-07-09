import { NextResponse } from 'next/server';
import { supabaseForRequest } from '@/lib/supabase/server';
import { getApiConfig, getSelectedBackend } from '@/lib/llm/config';
import { listBackends } from '@/lib/llm/backends';

/**
 * Lists the models the pipeline can be pinned to (for the settings dropdown):
 * the hosted API if a key is set, plus every model on each reachable Ollama
 * endpoint. Also returns the currently-selected backend id.
 */
export async function GET() {
  const supabase = supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const api = await getApiConfig();
  const [backends, selected] = await Promise.all([
    listBackends(api?.provider ?? null),
    getSelectedBackend(),
  ]);

  return NextResponse.json({ backends, selected: selected ?? 'auto' });
}
