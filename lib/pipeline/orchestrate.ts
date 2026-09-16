import { createHash } from 'crypto';
import { supabaseServiceRole } from '../supabase/server';
import { classifySignal } from './classify';
import { interpretSignal } from './interpret';
import { routeAudiences } from './route';
import { packageOutputs } from './package';

/**
 * Runs Stages 2 through 5 for a signal, in order - see 02-PIPELINE-STAGES.md
 * for why these stay separate LLM calls rather than one merged call. On any
 * stage failure (including the second failed retry inside that stage),
 * marks the signal 'error' rather than leaving it silently stuck, per
 * 07-API-ENDPOINTS.md's error-handling convention.
 */
export async function runPipeline(signalId: string): Promise<void> {
  const db = supabaseServiceRole();
  try {
    // Clear any existing outputs first so a re-run replaces rather than appends
    // - prevents duplicate stakeholder cards if the pipeline runs more than once.
    await db.from('signal_outputs').delete().eq('signal_id', signalId);
    const classification = await classifySignal(signalId);
    const interpretation = await interpretSignal(signalId);
    const routing = routeAudiences(classification.audience_relevance);
    await packageOutputs(signalId, interpretation, routing);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline] signal ${signalId} failed:`, message);
    await db.from('signals').update({ status: 'error' }).eq('id', signalId);
  }
}

/**
 * Dedupe check from 10-OPTIMIZATION-NOTES.md - before running the pipeline,
 * check whether this exact raw_text has already been submitted and isn't
 * rejected. Returns the existing signal (id + status) if found. The caller
 * dedupes a successful prior run, but re-runs one that had errored.
 */
export async function findExistingSignalByText(
  rawText: string
): Promise<{ id: string; status: string } | null> {
  const db = supabaseServiceRole();
  const { data } = await db
    .from('signals')
    .select('id, status')
    .eq('raw_text_hash', md5Hex(rawText))
    .neq('status', 'rejected')
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id, status: data.status as string } : null;
}

/**
 * Finds a signal already raised from a given source, regardless of its text.
 *
 * Deduping on the text alone breaks the moment the text changes for a reason
 * that is not a new event: carrying the feed's note across rewrote every
 * escalation's raw_text, so pressing Send to Signals on an item escalated
 * before that change produced a second signal for the same update.
 *
 * The ref must identify one feed item. The Crayon URL does not - 349 of them
 * are shared by more than one item here, and one covers 35 - so the feed item's
 * own id is used instead.
 */
export async function findExistingSignalBySourceRef(
  sourceRef: string
): Promise<{ id: string; status: string } | null> {
  const db = supabaseServiceRole();
  const { data } = await db
    .from('signals')
    .select('id, status')
    .eq('source_ref', sourceRef)
    .neq('status', 'rejected')
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id, status: data.status as string } : null;
}

/**
 * Re-runs the full pipeline for an existing signal (used when the same text is
 * resubmitted and the prior run had errored): clears any partial outputs,
 * resets to draft, and runs Stages 2–5 again from scratch.
 */
export async function rerunSignal(signalId: string): Promise<void> {
  const db = supabaseServiceRole();
  await db.from('signal_outputs').delete().eq('signal_id', signalId);
  await db.from('signals').update({ status: 'draft' }).eq('id', signalId);
  await runPipeline(signalId);
}

// Postgres's raw_text_hash column uses md5() - mirror that here so the
// dedupe lookup can filter by the generated column without a round trip.
function md5Hex(text: string): string {
  return createHash('md5').update(text).digest('hex');
}
