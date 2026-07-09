import { getLLMProvider } from '../llm';
import { interpretationSchema, type Interpretation } from '../llm/schemas';
import { withOneRetry } from './retry';
import { supabaseServiceRole } from '../supabase/server';
import type { Classification } from '../llm/schemas';

const GROUNDING_RULE = `Only state as fact what is directly supported by the raw signal text or
the competitor's known_facts below. Any claim that goes beyond
that — inference, speculation, or general knowledge — must be placed in
the unverified_claims array, not stated as settled fact in the main
content.`;

function buildPrompt(
  rawText: string,
  classification: Classification,
  competitorName: string,
  knownFacts: unknown[],
  extra?: string
) {
  return `You are explaining what a competitive signal means for Litera.

Raw signal: ${rawText}
Classification: ${JSON.stringify(classification)}
Known facts about ${competitorName}: ${JSON.stringify(knownFacts)}

Return a JSON object with:
- signal_summary: a plain-language summary of what happened
- why_it_matters: why this matters to Litera specifically
- unverified_claims: array of strings — any claim in your summary or
  implication that is NOT directly supported by the raw signal or the
  known facts above. If everything is fully supported, return an empty array.
- subject_account: the specific customer, prospect, or account named in this
  signal, if any (for example a firm being sold to or renewing). Use an empty
  string "" if the signal is general market news with no specific customer.

${GROUNDING_RULE}
${extra ? `\n${extra}\n` : ''}
Return only the JSON object.`;
}

/**
 * Stage 3 — Interpretation. This is one of the two stages the grounding
 * rule applies to (02-PIPELINE-STAGES.md) — must be verified against Claude
 * specifically before trusting it in production (08-TEST-FIXTURES-AND-TESTING.md).
 */
export async function interpretSignal(signalId: string): Promise<Interpretation> {
  const db = supabaseServiceRole();

  const { data: signal, error: signalErr } = await db
    .from('signals')
    .select('raw_text')
    .eq('id', signalId)
    .single();
  if (signalErr || !signal) throw new Error(`signal ${signalId} not found: ${signalErr?.message}`);

  const { data: classificationRow, error: classErr } = await db
    .from('signal_classification')
    .select('*')
    .eq('signal_id', signalId)
    .single();
  if (classErr || !classificationRow)
    throw new Error(`classification for signal ${signalId} not found — run classifySignal first`);

  let competitorName = 'Unknown';
  let knownFacts: unknown[] = [];
  if (classificationRow.competitor_id) {
    const { data: competitor } = await db
      .from('competitors')
      .select('name, known_facts')
      .eq('id', classificationRow.competitor_id)
      .single();
    if (competitor) {
      competitorName = competitor.name;
      knownFacts = competitor.known_facts ?? [];
    }
  }

  const classification: Classification = {
    competitor: competitorName,
    signal_type: classificationRow.signal_type,
    business_area: classificationRow.business_area,
    urgency: classificationRow.urgency,
    audience_relevance: classificationRow.audience_relevance,
  };

  const llm = await getLLMProvider();
  const interpretation = await withOneRetry((extra) =>
    llm.generateStructured({
      systemPrompt: 'You interpret competitive intelligence signals. Respond with JSON only.',
      userPrompt: buildPrompt(signal.raw_text, classification, competitorName, knownFacts, extra),
      schema: interpretationSchema,
    })
  );

  const { error: writeErr } = await db
    .from('signals')
    .update({ status: 'interpreted' })
    .eq('id', signalId);
  if (writeErr) throw new Error(`failed to advance signal status: ${writeErr.message}`);

  return interpretation;
}
