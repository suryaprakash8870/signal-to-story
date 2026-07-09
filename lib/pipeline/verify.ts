import { z } from 'zod';
import { withOneRetry } from './retry';
import { flexibleString } from '../llm/schemas';
import type { LLMProvider } from '../llm/provider';

export interface DraftOutput {
  index: number;
  audience: string;
  output_type: string;
  content: string;
}

const guardedSchema = z.object({
  outputs: z.array(z.object({ index: z.number(), cleaned_content: flexibleString })),
});

export interface GuardContext {
  rawText: string;
  competitorName: string;
  competitorFacts: unknown[];
  literaFacts: string;
  subjectAccount: string;
  otherCompetitors: string[];
}

/**
 * The always-on Quality Gate. Runs on EVERY signal (no skipping) and rewrites
 * each drafted output so it obeys the grounding rules:
 *   1. Every claim must trace to the SOURCE signal or the competitor facts.
 *   2. Litera: state ONLY facts in the confirmed Litera list; any other Litera
 *      capability/cert/feature must become an inline "[Rep to confirm: ...]"
 *      note — never asserted or invented.
 *   3. Never attribute the competitor's features/claims to Litera.
 *   4. Marketing must not name the specific customer/prospect.
 * One batched model call for all drafts. Returns index → cleaned content; a
 * missing index means the model dropped that output (caller treats as failure
 * and errors the signal — clean-or-error, no silent bad output).
 */
export async function guardOutputs(
  drafts: DraftOutput[],
  ctx: GuardContext,
  llm: LLMProvider
): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (drafts.length === 0) return result;

  const draftBlock = drafts
    .map((d) => `[${d.index}] (${d.audience} / ${d.output_type}):\n${d.content}`)
    .join('\n\n');

  const parsed = await withOneRetry((extra) =>
    llm.generateStructured({
      systemPrompt:
        'You are a strict compliance editor for competitive-intelligence content. Respond with JSON only.',
      userPrompt: `Rewrite EACH draft below so it obeys ALL of the rules. Keep each draft's
purpose, audience, tone, and format. Write concise, ORIGINAL text — do not copy
sentences from the source.

RULES (enforce every one):
1. GROUNDING: Every statement must be directly supported by the SOURCE signal or
   the COMPETITOR known facts. Remove anything else — invented numbers, features,
   or details.
2. LITERA (critical): You may ONLY state facts about Litera that appear in
   "Confirmed Litera facts" below. If a draft states, implies, or invents ANY
   Litera capability, certification, product, feature, price, security posture,
   track record, or strength that is NOT in that list, you MUST remove it. This
   includes VAGUE claims ("robust security", "proven track record", "enterprise-
   grade", "seamless integration") and IMPLIED claims ("we can meet their need
   for X", "our solution delivers X", "position ourselves as a reliable partner
   with X"). Do NOT replace it with a bare question OR a "confirm Litera's
   position" flag. Instead simply REPORT, as plain information, what the customer
   ACTUALLY asked for or raised in the source — using only the exact things they
   mentioned, never adding specifics they did not say. E.g. if a draft says
   "Litera provides robust security," and the source only says the client asked
   about "security and data handling," rewrite it as "The client raised security
   and data handling as requirements." Never assert Litera has the capability,
   and never introduce details that are not in the source.
3. ENTITY: Never attribute the competitor's features, products, or claims to
   Litera. The competitor's capabilities belong to the competitor, not to Litera.
4. MARKETING: A "marketing" output must be MARKET POSITIONING only. It must NOT
   name the specific customer/prospect/account, must NOT frame around a specific
   deal ("a firm is considering X"), and must NOT include account or sales tactics
   (pricing offers, "their budget", "the account", pilot or renewal mechanics).
   Write about the category, the competitor's positioning move, and the angle we
   could take — generalized to the market.
5. BATTLECARD: For a sales battlecard, if the SOURCE reveals a competitor
   weakness (weak/unproven security, a newer/smaller vendor, no committed
   pricing, a missing capability, or a customer concern about them), the response
   must LEAD with that specific weakness rather than generic filler like "we
   tailor our solution to your needs".
6. SPECIFICITY: Keep each draft anchored in the concrete details of the source.
   Do NOT replace specific content with vaguer language, and do NOT add generic
   filler ("stay attuned", "remain relevant", "in today's evolving landscape",
   "meet their needs"). If a draft is mostly filler with no source-specific
   substance, tighten it to only what the source concretely supports.
7. ONE COMPETITOR: The ONLY competitor that may appear is the one named in this
   signal ("${ctx.competitorName}"). Remove EVERY mention of any OTHER company or
   vendor — rewrite the sentence so it stands without it. In particular these
   known competitors are NOT part of this signal and must never appear:
   ${ctx.otherCompetitors.length ? ctx.otherCompetitors.join(', ') : '(none)'}.
8. PERSPECTIVE: Only a sales "talk_track" may address the customer as "you". In
   EVERY other output, refer to the customer in the third person ("the client",
   "the firm") — rewrite any "you/your" that refers to the customer.

Return a JSON object exactly like:
{ "outputs": [ { "index": <same number as the draft>, "cleaned_content": "..." }, ... ] }
with one entry per draft, reusing the same index numbers.

Confirmed Litera facts (the ONLY Litera facts allowed):
${ctx.literaFacts}

Competitor in this signal: ${ctx.competitorName}
Competitor known facts: ${JSON.stringify(ctx.competitorFacts)}
Other competitors that must NOT appear: ${ctx.otherCompetitors.length ? ctx.otherCompetitors.join(', ') : '(none)'}
${ctx.subjectAccount ? `Customer/prospect that MARKETING must NOT name: ${ctx.subjectAccount}` : 'No specific customer named in this signal.'}

SOURCE signal:
${ctx.rawText}

DRAFTS:
${draftBlock}
${extra ? `\n${extra}` : ''}`,
      schema: guardedSchema,
    })
  );

  for (const item of parsed.outputs) {
    const clean = item.cleaned_content.trim();
    if (clean.length > 0) result.set(item.index, clean);
  }
  return result;
}

/**
 * Free deterministic backstop for Rule 4: if the customer/prospect name still
 * appears in a marketing output after the model pass, replace it with a generic
 * term. No model call — a plain string replace.
 */
export function stripAccountName(content: string, account: string): string {
  if (!account) return content;
  const re = new RegExp(account.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return content.replace(re, 'a firm');
}

/**
 * Deterministic guard for Invariant 3 ("one competitor"): returns the first
 * OTHER competitor name that appears in `content` (whole-word, case-insensitive),
 * or null. Names shorter than 3 chars are skipped to avoid false positives.
 * The caller treats a hit as a bleed the model failed to remove and errors the
 * signal — a foreign vendor name can never ship.
 */
export function foreignEntity(content: string, names: string[]): string | null {
  for (const n of names) {
    if (!n || n.length < 3) continue;
    const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(content)) return n;
  }
  return null;
}

/**
 * Deterministic guard for the product self-contradiction: a product output that
 * BOTH asserts a real product gap AND says "no product implication" is
 * contradictory. When a genuine gap is asserted, the "no implication" escape
 * sentence is the wrong part — drop it. A pure escape (no gap language) is left
 * untouched.
 */
export function fixProductContradiction(content: string): string {
  const escape = /(?:^|[.\s])no\s+(?:direct\s+)?product\s+implication[^.]*\.?/i;
  if (!escape.test(content)) return content;
  const withoutEscape = content.replace(escape, ' ').replace(/\s{2,}/g, ' ').trim();
  const gapLike = /(gap in (?:litera|our|the)|litera'?s (?:current )?(?:offering|positioning|capabilit)|\blacks?\b|\bmissing\b|catch up|fall(?:s|ing)? short|pressure[^.]*(?:enhance|improve))/i;
  return gapLike.test(withoutEscape) ? withoutEscape : content;
}

/**
 * Raw-dump detector (Change 3): true when the content is mostly a verbatim copy
 * of the source signal rather than an original summary. Chunks the (normalized)
 * content and checks how much of it appears verbatim in the (normalized) source.
 */
export function isRawDump(content: string, rawText: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const c = norm(content);
  const r = norm(rawText);
  if (c.length < 60) return false; // too short to judge confidently

  const chunks = c.match(/.{1,80}/g) ?? [];
  if (chunks.length === 0) return false;
  const copied = chunks.filter((chunk) => chunk.length > 20 && r.includes(chunk)).length;
  return copied / chunks.length > 0.6;
}
