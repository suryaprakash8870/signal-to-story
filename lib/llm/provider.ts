import type { ZodType, ZodTypeDef } from 'zod';

export interface GenerateStructuredParams<T> {
  systemPrompt: string;
  userPrompt: string;
  // Output = T, Input = any — so schemas that coerce shapes via .transform()
  // (input type ≠ output type; see schemas.ts) are accepted and T is the
  // parsed output type.
  schema: ZodType<T, ZodTypeDef, any>;
}

export interface LLMProvider {
  generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T>;
}

/**
 * Strips markdown code fences if the model wraps its JSON despite
 * instructions not to — cheap defensive parsing, not a substitute for the
 * "no markdown code fences" instruction in every system prompt.
 */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

/**
 * Sampling temperature for every pipeline call.
 *
 * The pipeline classifies, extracts and fact-checks; none of that benefits from
 * creative variation, and variation is actively harmful when a reader
 * regenerates a note and gets different wording for the same input. Zero is as
 * close to repeatable as these APIs offer.
 *
 * Not applied to the Litera gateway: gpt-5 accepts only its default temperature
 * and returns 400 for any explicit value. See litera-provider.ts.
 */
export const PIPELINE_TEMPERATURE = 0;

/**
 * True when an error means "this backend is unavailable right now" rather than
 * "this backend answered badly".
 *
 * The distinction matters for falling back to another backend: an expired token
 * or an exhausted quota is worth retrying elsewhere, but malformed JSON is a
 * prompt or model-quality problem another backend would likely hit too, and
 * silently switching would hide it.
 */
export function isAvailabilityError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);

  // Only look for the status in the text BEFORE the response body. Providers
  // append the raw body, which routinely carries codes of its own, and matching
  // those made a 400 "bad request" whose body mentioned 429 look like a rate
  // limit. Cutting at the first brace keeps the provider's own prefix only.
  const head = msg.split('{')[0].slice(0, 80);

  return (
    /(401|403|429|500|502|503|504)/.test(head) ||
    /expired|unauthor|rate limit|quota|neurons|overloaded|unreachable|timeout|aborted|fetch failed|ECONNREFUSED|ETIMEDOUT/i.test(
      msg
    )
  );
}
