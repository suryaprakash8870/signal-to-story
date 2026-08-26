import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest } from '@/lib/supabase/server';

// Reads request state and live data, so it must never be statically
// evaluated at build time.
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supabaseForRequest();

  const { data: signal, error: signalErr } = await supabase
    .from('signals')
    .select('*')
    .eq('id', params.id)
    .single();
  if (signalErr || !signal) {
    return NextResponse.json({ error: signalErr?.message ?? 'not found' }, { status: 404 });
  }

  const { data: classification } = await supabase
    .from('signal_classification')
    .select('*')
    .eq('signal_id', params.id)
    .maybeSingle();

  const { data: outputs } = await supabase
    .from('signal_outputs')
    .select('*')
    .eq('signal_id', params.id)
    .order('audience', { ascending: true });

  return NextResponse.json({ signal, classification, outputs: outputs ?? [] });
}
