import { NextResponse } from 'next/server';
import { supabaseForRequest } from '@/lib/supabase/server';

/**
 * Signals that need a reviewer's attention outside the normal output queue:
 * - 'error': the pipeline failed (surface, don't let them vanish — 07-API).
 * - 'classified' / 'interpreted': mid-pipeline. Usually transient, but if the
 *   process died (e.g. a restart) they're orphaned here and can be retried.
 */
export async function GET() {
  const supabase = supabaseForRequest();
  const { data, error } = await supabase
    .from('signals')
    .select('id, raw_text, source_type, status, submitted_at')
    .in('status', ['error', 'classified', 'interpreted'])
    .order('submitted_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ signals: data ?? [] });
}
