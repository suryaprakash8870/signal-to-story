import { NextRequest, NextResponse } from 'next/server';
import { supabaseServiceRole } from '@/lib/supabase/server';
import { mapCrayonSpark } from '@/lib/connectors/crayon-connector';
import { runPipeline, rerunSignal, findExistingSignalByText } from '@/lib/pipeline/orchestrate';

/**
 * Crayon outbound webhook receiver — the preferred alternative to polling
 * (10-OPTIMIZATION-NOTES.md). Crayon POSTs an alert here; we turn it into a
 * signal and run the pipeline. Authenticated by a shared secret in the query
 * string or header (CRAYON_WEBHOOK_SECRET) since it has no user session.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRAYON_WEBHOOK_SECRET;
  const presented = req.headers.get('x-crayon-secret') ?? new URL(req.url).searchParams.get('secret');
  if (!secret || presented !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let alert: Record<string, unknown>;
  try {
    alert = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const candidate = mapCrayonSpark(alert);
  if (!candidate.raw_text) {
    return NextResponse.json({ error: 'alert had no usable content' }, { status: 422 });
  }

  const existing = await findExistingSignalByText(candidate.raw_text);
  if (existing) {
    if (existing.status === 'error') {
      rerunSignal(existing.id).catch((e) => console.error('[pipeline] crayon rerun error:', e));
      return NextResponse.json({ ok: true, rerun: existing.id });
    }
    return NextResponse.json({ ok: true, deduped: existing.id });
  }

  const db = supabaseServiceRole();
  const { data: signal, error } = await db
    .from('signals')
    .insert({
      raw_text: candidate.raw_text,
      source_type: 'crayon',
      source_ref: candidate.source_ref,
      source_links: candidate.source_links ?? null,
    })
    .select('id')
    .single();
  if (error || !signal) {
    return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 });
  }

  runPipeline(signal.id).catch((e) => console.error('[pipeline] crayon webhook error:', e));
  return NextResponse.json({ ok: true, created: signal.id }, { status: 201 });
}
