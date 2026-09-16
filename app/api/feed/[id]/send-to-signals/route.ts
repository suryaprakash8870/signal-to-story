import { NextResponse } from 'next/server';
import { supabaseServiceRole } from '@/lib/supabase/server';
import { DISTRIBUTORS, requireRole } from '@/lib/auth/roles';
import { findExistingSignalByText, rerunSignal, runPipeline } from '@/lib/pipeline/orchestrate';

// Reads request state and live data, so it must never be statically
// evaluated at build time.
export const dynamic = 'force-dynamic';

/**
 * The bridge between the two jobs the tool does.
 *
 * The Feed is the newspaper - a PM reads it, nobody approves anything, per
 * Dale's PRD ("No approval step - notes shown directly to PMs"). Signals is
 * the drafting desk - a PMM writes four team-specific versions of an update
 * and each one is approved before it goes out. Those stay separate screens on
 * purpose; merging them would put an approval step on the Feed, which the PRD
 * explicitly rules out.
 *
 * What was missing was a way to get a Feed item onto the drafting desk without
 * a PMM retyping it into the (deliberately hidden) manual-entry screen. This
 * is that one step: take a Feed item's own text, hand it to the same pipeline
 * every other signal goes through, and send the PMM straight to the result.
 *
 * PMM/Admin only - a Product Manager reads the Feed and was never meant to
 * trigger distribution from it.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireRole(DISTRIBUTORS);
  if (!guard.ok) return guard.response;

  const db = supabaseServiceRole();
  const { data: update, error } = await db
    .from('competitor_updates')
    .select('content, competitor_name, source_url')
    .eq('id', params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!update) return NextResponse.json({ error: 'That update no longer exists.' }, { status: 404 });

  // Same "Competitor: X\n\n<text>" shape the relevance-note generator already
  // uses (lib/feed/ingest.ts) - it is what lets the classify stage identify
  // the right competitor from plain text, since no competitor_id is passed at
  // signal creation.
  const raw_text = `Competitor: ${update.competitor_name}\n\n${update.content}`;

  // Mirrors POST /api/signals: dedupe on identical text, and treat an ERRORED
  // prior attempt as worth retrying rather than a duplicate.
  const existing = await findExistingSignalByText(raw_text);
  if (existing) {
    if (existing.status === 'error') {
      rerunSignal(existing.id).catch((err) => console.error('[send-to-signals] rerun error:', err));
      return NextResponse.json({ id: existing.id, rerun: true }, { status: 202 });
    }
    return NextResponse.json({ id: existing.id, deduped: true });
  }

  const { data: signal, error: insertErr } = await db
    .from('signals')
    .insert({
      raw_text,
      source_type: 'crayon',
      source_ref: update.source_url ?? params.id,
      submitted_by: guard.actor.id,
    })
    .select('id')
    .single();

  if (insertErr || !signal) {
    return NextResponse.json({ error: insertErr?.message ?? 'could not create the signal' }, { status: 500 });
  }

  // Fired without blocking the response - the PMM watches progress on
  // /signals/[id], the same as every other entry point into the pipeline.
  runPipeline(signal.id).catch((err) => console.error('[send-to-signals] pipeline error:', err));

  return NextResponse.json({ id: signal.id }, { status: 201 });
}
