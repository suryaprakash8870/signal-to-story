import { NextResponse } from 'next/server';
import { supabaseForRequest } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/roles';
import { getApiConfig, getSelectedBackend } from '@/lib/llm/config';
import { listBackends } from '@/lib/llm/backends';

// Reads request state and live data, so it must never be statically
// evaluated at build time.
export const dynamic = 'force-dynamic';

/**
 * Lists the models the pipeline can be pinned to (for the settings dropdown):
 * the hosted API if a key is set, plus every model on each reachable Ollama
 * endpoint. Also returns the currently-selected backend id.
 */
export async function GET() {
  const guard = await requireRole(['admin']);
  if (!guard.ok) return guard.response;
  const supabase = supabaseForRequest();

  const api = await getApiConfig();
  const [backends, selected] = await Promise.all([
    listBackends(api?.provider ?? null),
    getSelectedBackend(),
  ]);

  return NextResponse.json({ backends, selected: selected ?? 'auto' });
}
