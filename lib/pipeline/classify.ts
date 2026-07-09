import { getLLMProvider } from '../llm';
import { classificationSchema, type Classification } from '../llm/schemas';
import { withOneRetry } from './retry';
import { supabaseServiceRole } from '../supabase/server';

function buildPrompt(rawText: string, competitors: { id: string; name: string }[], extra?: string) {
  const competitorList = competitors.map((c) => c.name).join(', ') || '(none known yet)';
  return `You are classifying a raw competitive intelligence signal for Litera, a
legal technology company.

Known competitors: ${competitorList}

Given the raw signal below, return a JSON object with:
- competitor: string (must match one of the known competitors, or "Unknown")
- signal_type: string (e.g. pricing, product_launch, messaging, win_loss)
- business_area: string (which part of Litera's business this touches)
- urgency: "low" | "medium" | "high"
- audience_relevance: object with keys sales, product, marketing, leadership,
  each valued "low" | "medium" | "high"

Return only the JSON object, no other text.
${extra ? `\n${extra}\n` : ''}
Raw signal:
${rawText}`;
}

/** Stage 2 — Classification. Writes signal_classification, advances status. */
export async function classifySignal(signalId: string): Promise<Classification> {
  const db = supabaseServiceRole();

  const { data: signal, error: signalErr } = await db
    .from('signals')
    .select('raw_text')
    .eq('id', signalId)
    .single();
  if (signalErr || !signal) throw new Error(`signal ${signalId} not found: ${signalErr?.message}`);

  const { data: competitors } = await db.from('competitors').select('id, name');

  const llm = await getLLMProvider();
  const classification = await withOneRetry((extra) =>
    llm.generateStructured({
      systemPrompt: 'You classify competitive intelligence signals. Respond with JSON only.',
      userPrompt: buildPrompt(signal.raw_text, competitors ?? [], extra),
      schema: classificationSchema,
    })
  );

  const matched = (competitors ?? []).find(
    (c) => c.name.toLowerCase() === classification.competitor.toLowerCase()
  );

  const { error: writeErr } = await db.from('signal_classification').upsert({
    signal_id: signalId,
    competitor_id: matched?.id ?? null,
    signal_type: classification.signal_type,
    business_area: classification.business_area,
    urgency: classification.urgency,
    audience_relevance: classification.audience_relevance,
  });
  if (writeErr) throw new Error(`failed to write classification: ${writeErr.message}`);

  await db.from('signals').update({ status: 'classified' }).eq('id', signalId);

  return classification;
}
