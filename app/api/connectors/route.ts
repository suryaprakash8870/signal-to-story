import { NextResponse } from 'next/server';
import { supabaseForRequest } from '@/lib/supabase/server';

// Reads request state and live data, so it must never be statically
// evaluated at build time.
export const dynamic = 'force-dynamic';

// Lists connectors with status/mode only. credentials_ref is intentionally
// selected (it is just an opaque Vault id, not the secret) but the raw
// secret is never returned - see 04-CONNECTORS.md.
export async function GET() {
  const supabase = supabaseForRequest();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, type, direction, mode, status, cadence, config, credentials_ref')
    .order('type', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mask credentials_ref to a boolean so the browser only learns whether a
  // credential exists, never the reference itself.
  const connectors = (data ?? []).map(({ credentials_ref, ...rest }) => ({
    ...rest,
    has_credential: !!credentials_ref,
  }));
  return NextResponse.json({ connectors });
}
