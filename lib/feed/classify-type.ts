import { z } from 'zod';
import { getLLMProvider } from '../llm';
import { supabaseServiceRole } from '../supabase/server';
import type { UpdateType } from './parse-updates';

// Classifies the updates that emoji and keyword matching could not identify.
//
// Type comes from an emoji at the start of a Crayon bullet, which is Crayon's
// own label and reliable when present. Many Sparks are written without one, and
// the regex fallback is deliberately conservative, so anything unclear became
// 'other'. That left 56% of updates unclassified and made the type filter -
// a named requirement - close to useless.
//
// Three design choices make this a fix rather than a patch:
//
//   1. It only ever runs on updates the first two layers could not identify, so
//      Crayon's own label is never overridden and a correct type cannot be made
//      worse.
//   2. It classifies in batches, so 400 unknown updates cost ~20 calls, not 400.
//   3. 'other' stays a legitimate answer. Forcing every update into a category
//      would trade a visible problem for an invisible one.

const VALID: UpdateType[] = ['release', 'pricing', 'win', 'expansion', 'risk', 'other'];

/** Updates classified per model call. Large enough to be cheap, small enough to stay accurate. */
const BATCH = 20;

const schema = z.object({
  types: z
    .union([z.array(z.any()), z.null()])
    .optional()
    .transform((v): string[] => {
      if (!Array.isArray(v)) return [];
      return v.map((x) => String(x ?? '').trim().toLowerCase());
    }),
});

const PROMPT_RULES = `Classify each competitor update into exactly one type:

- release   : a new product, feature, capability, module or version shipped or announced
- pricing   : pricing, packaging, discounting, licensing or commercial terms
- win       : a named customer choosing, adopting or expanding use of the product
- expansion : entering a market or region, opening an office, notable hiring, partnerships that extend reach
- risk      : outages, breaches, lawsuits, layoffs, negative reviews, analyst concerns, competitive pressure against them
- other     : anything that fits none of the above, including general company news

Judge what the update is ABOUT, not which words appear in it. If an update genuinely fits none of the categories, answer "other" - that is a correct answer, not a failure. Do not stretch an update into a category it does not belong in.`;

/**
 * Classifies a batch of update texts. Returns one type per input, in order.
 * Anything the model does not answer for stays 'other'.
 */
async function classifyBatch(texts: string[]): Promise<UpdateType[]> {
  const llm = await getLLMProvider();
  const numbered = texts
    .map((t, i) => `${i + 1}. ${t.replace(/\s+/g, ' ').slice(0, 400)}`)
    .join('\n');

  const result = await llm.generateStructured({
    systemPrompt:
      'You classify competitor intelligence updates by type. Respond with JSON only, no markdown fences.',
    userPrompt: `${PROMPT_RULES}

Updates:
${numbered}

Return JSON: { "types": ["...", "..."] }

The array must have exactly ${texts.length} entries, one per numbered update, in the same order. Each entry must be one of: release, pricing, win, expansion, risk, other.

Return only the JSON object.`,
    schema,
  });

  // Short or malformed answers degrade to 'other' per position rather than
  // failing the batch, so one bad response cannot lose 20 updates.
  return texts.map((_, i) => {
    const raw = result.types[i];
    return (VALID as string[]).includes(raw) ? (raw as UpdateType) : 'other';
  });
}

export interface ClassifyResult {
  examined: number;
  reclassified: number;
  stillOther: number;
  failed: number;
  byType: Record<string, number>;
}

/**
 * Classifies stored updates that are currently 'other' and were not labelled by
 * Crayon's emoji. Safe to re-run: only untouched rows are considered.
 */
export async function classifyUnknownTypes(limit = 1000): Promise<ClassifyResult> {
  const db = supabaseServiceRole();

  const { data, error } = await db
    .from('competitor_updates')
    .select('id, content, type_source')
    .eq('update_type', 'other')
    // `type_source <> 'model'` alone would exclude every existing row: rows
    // predating the column hold NULL, and in SQL `NULL <> 'model'` is NULL
    // rather than true, so they never match. Ask for null OR not-model.
    .or('type_source.is.null,type_source.neq.model')
    .limit(limit);

  const empty: ClassifyResult = {
    examined: 0,
    reclassified: 0,
    stillOther: 0,
    failed: 0,
    byType: {},
  };
  if (error || !data || data.length === 0) return empty;

  const rows = data as unknown as { id: string; content: string }[];
  const out: ClassifyResult = { ...empty, examined: rows.length, byType: {} };

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    let types: UpdateType[];
    try {
      types = await classifyBatch(batch.map((r) => r.content));
    } catch (err) {
      out.failed += batch.length;
      console.warn(
        `[classify] batch of ${batch.length} failed: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`
      );
      continue;
    }

    for (let j = 0; j < batch.length; j++) {
      const type = types[j];
      const { error: writeErr } = await db
        .from('competitor_updates')
        .update({ update_type: type, type_source: 'model' })
        .eq('id', batch[j].id);
      if (writeErr) {
        out.failed++;
        continue;
      }
      out.byType[type] = (out.byType[type] ?? 0) + 1;
      if (type === 'other') out.stillOther++;
      else out.reclassified++;
    }
  }

  return out;
}
