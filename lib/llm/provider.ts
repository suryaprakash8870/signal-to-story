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
