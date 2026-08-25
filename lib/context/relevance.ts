import { z } from 'zod';
import { getLLMProvider } from '../llm';
import { flexibleString } from '../llm/schemas';
import { supabaseServiceRole } from '../supabase/server';

// Generates the "why it matters for us" note for a competitor update, grounded
// in Litera's own context library.
//
// Four steps, each giving the model the smallest input it needs:
//   1. Shortlist  - show only section HEADINGS, ask which are relevant.
//   2. Retrieve   - fetch the full text of just those sections.
//   3. Generate   - write the note from that text alone.
//   4. Verify     - check the claimed link actually holds; if not, fall back
//                   to the general note rather than asserting a bad link.
//
// If nothing in the library is relevant, the note stays general instead of
// inventing a connection. That behaviour is the point, not a failure mode.

const DOC_TYPE_LABELS: Record<string, string> = {
  roadmap: 'Product Roadmap',
  gtm_strategy: 'GTM Strategy',
  positioning: 'Positioning',
  growth_story: 'Growth Story',
  company_profile: 'Company Profile',
  other: 'Context Document',
};

export interface RelevanceNote {
  note: string;
  /** Section the note was grounded in, or null when it stayed general. */
  groundedIn: { documentTitle: string; docType: string; heading: string } | null;
  /** True when the library had nothing genuinely relevant to this update. */
  general: boolean;
}

interface SectionRow {
  id: string;
  heading: string;
  content: string;
  document_id: string;
  context_documents: { title: string; doc_type: string } | null;
}

// Section numbers from the list shown to the model. Empty means nothing was
// relevant, which is a valid and common answer. Smaller models sometimes omit
// the key entirely (returning `{}`) or send a bare number instead of an array
// when they mean "nothing" or "just this one", so the field is optional and
// coerced rather than strict — an unparseable answer degrades to "nothing
// relevant", which is the safe direction.
const shortlistSchema = z.object({
  relevant: z
    .union([z.array(z.any()), z.number(), z.string(), z.null()])
    .optional()
    .transform((v): number[] => {
      if (v === undefined || v === null) return [];
      const arr = Array.isArray(v) ? v : [v];
      return arr
        .map((x) => Number(x))
        .filter((n) => Number.isInteger(n) && n > 0);
    }),
});

// `grounded` is optional and coerced: a missing or odd value degrades to false
// (an ungrounded, general note) rather than failing the whole request.
const noteSchema = z.object({
  note: flexibleString,
  grounded: z
    .union([z.boolean(), z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string') return v.trim().toLowerCase() === 'true';
      return false;
    }),
});

// A missing/odd `supported` value degrades to false, dropping the claimed link
// rather than letting an unverified one through.
const verifySchema = z.object({
  supported: z
    .union([z.boolean(), z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string') return v.trim().toLowerCase() === 'true';
      return false;
    }),
  reason: flexibleString.optional(),
});

/** Loads every context section with its parent document metadata. */
async function loadSections(): Promise<SectionRow[]> {
  const db = supabaseServiceRole();
  const { data, error } = await db
    .from('context_sections')
    .select('id, heading, content, document_id, context_documents(title, doc_type)')
    .order('position', { ascending: true });
  if (error) throw new Error(`failed to load context sections: ${error.message}`);
  return (data ?? []) as unknown as SectionRow[];
}

function docLabel(s: SectionRow): string {
  const type = s.context_documents?.doc_type ?? 'other';
  return DOC_TYPE_LABELS[type] ?? DOC_TYPE_LABELS.other;
}

/**
 * Step 1 - shortlist. The model sees only numbered section titles (cheap, and
 * easier to judge than a wall of text) and returns the ones worth reading.
 */
async function shortlistSections(update: string, sections: SectionRow[]): Promise<SectionRow[]> {
  if (sections.length === 0) return [];

  const listing = sections
    .map((s, i) => `${i + 1}. [${docLabel(s)}] ${s.heading}`)
    .join('\n');

  const llm = await getLLMProvider();
  const result = await llm.generateStructured({
    systemPrompt:
      'You match competitor updates to a company\'s own internal strategy documents. Respond with JSON only, no markdown fences.',
    userPrompt: `A competitor update has come in. Below are the section titles of our own internal documents (roadmap, GTM strategy, positioning, growth story, company profile).

Competitor update:
${update}

Our document sections:
${listing}

Return JSON: { "relevant": [numbers] }

A section counts as relevant ONLY if it names something CONCRETE that this update also touches. Specifically, at least one of:
- the same product or capability (e.g. the update is about contract drafting and the section covers our contract drafting product)
- the same named technology or feature area (e.g. both concern an AI agent, or both concern document management)
- the same specific market segment the update names (e.g. the update targets mid-sized firms and the section is about our mid-market strategy)

A shared theme is NOT enough. "Both are about AI", "both are about competition", or "both are about legal technology" do NOT qualify. If your reason for picking a section would be a broad category rather than a specific overlap, do not pick it.

Company news with no product or market substance - leadership and executive changes, funding rounds, office openings, hiring, awards, conference attendance - has NO concrete overlap with strategy documents. Return an empty array for those.

Most updates match zero or one section. Returning an empty array is a correct and expected answer.

Return only the JSON object.`,
    schema: shortlistSchema,
  });

  return result.relevant
    .map((n) => sections[n - 1])
    .filter((s): s is SectionRow => Boolean(s))
    .slice(0, 3);
}

/** Step 3 - write the note from the shortlisted sections only. */
async function writeNote(update: string, chosen: SectionRow[]): Promise<{ note: string; grounded: boolean }> {
  const llm = await getLLMProvider();

  const contextBlock = chosen.length
    ? chosen
        .map(
          (s) =>
            `--- From "${s.context_documents?.title ?? 'Context'}" (${docLabel(s)}), section "${s.heading}" ---\n${s.content}`
        )
        .join('\n\n')
    : '(No section of our internal documents was found to be relevant to this update.)';

  const result = await llm.generateStructured({
    systemPrompt:
      'You write short, grounded competitive relevance notes for product managers. Respond with JSON only, no markdown fences.',
    userPrompt: `Write a "why it matters for us" note for a product manager about this competitor update.

Competitor update:
${update}

Relevant excerpts from our own internal documents:
${contextBlock}

Return JSON: { "note": "...", "grounded": true|false }

Rules for the note:
- One or two sentences. Plain, direct language. No preamble.
- The excerpts above were already screened as relevant to this update. So if you can name a product, capability, feature area, or market segment that appears in BOTH the update and the excerpts, set "grounded" to true and name that specific thing in the note.
- Only set "grounded" to false if, on reading the excerpts, you find they do not actually share anything concrete with this update after all, or the only link is a broad theme (AI, competition, legal technology, efficiency). In that case write a short general note about what the update signals instead.
- Do NOT invent or stretch a connection that is not in the excerpts.
- State only what the update and the excerpts support. If you are inferring, use measured wording such as "may" or "suggests" rather than stating it as fact.
- Do not claim any capability of ours that is not stated in the excerpts.

Return only the JSON object.`,
    schema: noteSchema,
  });

  return { note: result.note.trim(), grounded: result.grounded };
}

/**
 * Step 4 - verify. Confirms the note's claimed link to our document actually
 * holds. Mirrors the grounding check already used elsewhere in the pipeline:
 * an unsupported claim is dropped rather than shown.
 */
async function verifyNote(update: string, note: string, section: SectionRow): Promise<boolean> {
  const llm = await getLLMProvider();
  const result = await llm.generateStructured({
    systemPrompt:
      'You fact-check whether a written note is actually supported by a source excerpt. Respond with JSON only, no markdown fences.',
    userPrompt: `A note was written about a competitor update, claiming it relates to one of our internal documents. Check whether that claim actually holds.

Competitor update:
${update}

Our document section ("${section.heading}"):
${section.content}

The note that was written:
${note}

Return JSON: { "supported": true|false, "reason": "short explanation" }

Set "supported" to true if you can name a thing - a product, capability, feature area, or market segment - that appears in BOTH the competitor update AND the document section above. Name it in your reason. Related capabilities count as shared: for example contract drafting and contract review are the same area, and an AI assistant and an AI agent are the same area.

Set "supported" to false only if one of these clearly applies:
- The ONLY link is a broad theme (AI, competition, legal technology, efficiency) with no shared product, capability, or market segment behind it.
- The note references a product or claim that does not appear in the section text at all.
- The update is company news (leadership change, funding, hiring, an event) with no product or market substance, so no genuine link is possible.
- The note states an inference as established fact rather than using measured wording.

Judge the connection, not the wording. If a real shared subject exists, the note is supported even if it is phrased broadly.

Return only the JSON object.`,
    schema: verifySchema,
  });
  return result.supported;
}

/**
 * Generates the relevance note for one competitor update.
 * Safe by construction: any failure to ground cleanly falls back to a general
 * note rather than surfacing an unverified link.
 */
export async function generateRelevanceNote(update: string): Promise<RelevanceNote> {
  const sections = await loadSections();

  // Nothing uploaded yet - stay general rather than failing.
  if (sections.length === 0) {
    const { note } = await writeNote(update, []);
    return { note, groundedIn: null, general: true };
  }

  const chosen = await shortlistSections(update, sections);

  if (chosen.length === 0) {
    const { note } = await writeNote(update, []);
    return { note, groundedIn: null, general: true };
  }

  const { note, grounded } = await writeNote(update, chosen);

  // The model itself judged the context not genuinely relevant.
  if (!grounded) {
    return { note, groundedIn: null, general: true };
  }

  const primary = chosen[0];
  const supported = await verifyNote(update, note, primary);

  if (!supported) {
    // Claimed link did not hold - fall back to an ungrounded note.
    const fallback = await writeNote(update, []);
    return { note: fallback.note, groundedIn: null, general: true };
  }

  return {
    note,
    groundedIn: {
      documentTitle: primary.context_documents?.title ?? 'Context document',
      docType: primary.context_documents?.doc_type ?? 'other',
      heading: primary.heading,
    },
    general: false,
  };
}
