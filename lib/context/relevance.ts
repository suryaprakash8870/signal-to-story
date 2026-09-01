import { createHash } from 'crypto';
import { z } from 'zod';
import { getLLMProvider } from '../llm';
import { flexibleString } from '../llm/schemas';
import { supabaseServiceRole } from '../supabase/server';
import { rankSectionsByEmbedding, SHORTLIST_SIZE } from './embeddings';
import { rankLexically } from './lexical';

/**
 * Records that a model's answer had to be coerced into shape.
 *
 * The schemas below deliberately accept malformed output and degrade to a safe
 * default rather than failing the request. That is the right behaviour, but it
 * makes a model returning junk indistinguishable from a model correctly finding
 * no match. Logging every coercion is what makes the difference visible, so the
 * rate can be watched instead of guessed at.
 */
function noteCoercion(step: string, field: string, received: unknown): void {
  console.warn(
    `[relevance] ${step}: coerced malformed "${field}" (received ${JSON.stringify(received)?.slice(0, 80)})`
  );
}

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
  /**
   * Which model wrote this note. Notes produced on different backends are not a
   * consistent quality baseline, so the feed can say which is which and a
   * re-run can target only those from a weaker model.
   */
  model?: string;
  /**
   * Fingerprint of everything the note was generated from. Identical input
   * gives an identical hash, which is what lets a regenerate return the stored
   * note instead of producing fresh wording for unchanged material.
   */
  inputHash?: string;
}

/**
 * Fingerprints the inputs to a note: the update text, and the sections it was
 * written from. Changing either should produce a different note; changing
 * neither should not.
 */
export function noteInputHash(update: string, sectionIds: string[]): string {
  return createHash('sha256')
    .update(update.trim())
    .update('|')
    .update([...sectionIds].sort().join(','))
    .digest('hex')
    .slice(0, 32);
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
      if (v === undefined || v === null) {
        // Absent key: the model did not answer the question asked. Treated as
        // "nothing relevant", but recorded because it is not the same thing.
        if (v === undefined) noteCoercion('shortlist', 'relevant', v);
        return [];
      }
      if (!Array.isArray(v)) noteCoercion('shortlist', 'relevant', v);
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
      if (typeof v === 'string') {
        noteCoercion('write-note', 'grounded', v);
        return v.trim().toLowerCase() === 'true';
      }
      if (v !== undefined) noteCoercion('write-note', 'grounded', v);
      return false;
    }),
  // Which shortlisted section the note was actually written from, 1-based
  // against the list shown to the model. Without this the pipeline had to
  // assume the first section, which produced correct notes attributed to the
  // wrong source. Optional and coerced like the rest: a missing value falls
  // back to checking every shortlisted section rather than failing.
  section: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v): number | null => {
      if (v === undefined || v === null) return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1) {
        noteCoercion('write-note', 'section', v);
        return null;
      }
      return n;
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
      if (typeof v === 'string') {
        noteCoercion('verify', 'supported', v);
        return v.trim().toLowerCase() === 'true';
      }
      if (v !== undefined) noteCoercion('verify', 'supported', v);
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

  // Headings alone are not enough to judge relevance: Litera's are product
  // names such as "Kira" or "Office & Dragons", which say nothing about what
  // the section covers. A short preview makes the choice possible, at a cost
  // of about one line per section.
  const listing = sections
    .map((s, i) => {
      const preview = s.content.replace(/\s+/g, ' ').slice(0, 140);
      return `${i + 1}. [${docLabel(s)}] ${s.heading} - ${preview}`;
    })
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

/**
 * Step 3 - write the note from the shortlisted sections only.
 *
 * Returns which section the note was written from, so step 4 can fact-check
 * against the right text and the feed can cite the right source. Sections are
 * numbered in the prompt for exactly that reason.
 */
async function writeNote(
  update: string,
  chosen: SectionRow[]
): Promise<{ note: string; grounded: boolean; section: number | null }> {
  const llm = await getLLMProvider();

  const contextBlock = chosen.length
    ? chosen
        .map(
          (s, i) =>
            `--- SECTION ${i + 1}: from "${s.context_documents?.title ?? 'Context'}" (${docLabel(s)}), section "${s.heading}" ---\n${s.content}`
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

Return JSON: { "note": "...", "grounded": true|false, "section": <number> }

"section" is the number of the SECTION above that you actually drew on. Set it only when "grounded" is true, and make sure it is the section your note genuinely came from rather than simply the first one.

Rules for the note:
- One or two sentences. Plain, direct language. No preamble.
- The excerpts above were already screened as relevant to this update. So if you can name a product, capability, feature area, or market segment that appears in BOTH the update and the excerpts, set "grounded" to true and name that specific thing in the note.
- Set "grounded" to false if, on reading the excerpts, they do not actually share anything concrete with this update, or the only link is a broad theme (AI, competition, legal technology, efficiency). In that case write a short general note about what the update signals instead.
- Set "grounded" to false whenever the update is company news with no product or market substance: a leadership or executive change, a funding round, an acquisition rumour, hiring, an office opening, an award, or conference attendance. Those have no concrete product overlap even when an excerpt happens to mention the same company, so they must stay general.
- Do NOT invent or stretch a connection that is not in the excerpts.
- State only what the update and the excerpts support. If you are inferring, use measured wording such as "may" or "suggests" rather than stating it as fact.
- Do not claim any capability of ours that is not stated in the excerpts.

Return only the JSON object.`,
    schema: noteSchema,
  });

  // A section number outside the shortlist means the model referred to
  // something it was not shown; drop it and let the caller verify against each
  // candidate instead of trusting a bad index.
  const section =
    result.section !== null && result.section <= chosen.length ? result.section : null;
  if (result.section !== null && section === null) {
    noteCoercion('write-note', 'section (out of range)', result.section);
  }

  return { note: result.note.trim(), grounded: result.grounded, section };
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
 * Step 1 - pick the sections worth reading.
 *
 * Embeddings first: they rank on section CONTENT, so a competitor update about
 * contract redlining matches a section headed only "Kira". They also cost no
 * model call, taking a note from four calls down to three.
 *
 * The model shortlist remains as a fallback for when embeddings have not been
 * backfilled yet or the embedding provider is unavailable, so the feature
 * degrades rather than breaking.
 */
async function selectSections(update: string, sections: SectionRow[]): Promise<SectionRow[]> {
  const byId = new Map(sections.map((s) => [s.id, s]));

  // Embeddings first when they have been backfilled: they handle synonyms that
  // share no words, which is the one thing lexical matching cannot do.
  const embedded = await rankSectionsByEmbedding(update, SHORTLIST_SIZE);
  if (embedded && embedded.length > 0) {
    return embedded.map((r) => byId.get(r.id)).filter((s): s is SectionRow => Boolean(s));
  }

  // BM25 over heading AND content. This is the dependable path: no API call, no
  // quota, deterministic, and it solves the original defect, which was that the
  // shortlist could only see headings. Product names like "Kira" tell a reader
  // nothing; the text underneath them does.
  const lexical = rankLexically(
    update,
    sections.map((s) => ({ id: s.id, text: `${s.heading}
${s.content}` })),
    SHORTLIST_SIZE
  );
  if (lexical.length > 0) {
    return lexical.map((r) => byId.get(r.id)).filter((s): s is SectionRow => Boolean(s));
  }

  // Nothing shared a meaningful term with the update. For company news - a
  // leadership change, a funding round - that is the correct answer, and paying
  // for a model call to reach it would be waste.
  return [];
}

/**
 * Generates the relevance note for one competitor update.
 * Safe by construction: any failure to ground cleanly falls back to a general
 * note rather than surfacing an unverified link.
 */
export async function generateRelevanceNote(update: string): Promise<RelevanceNote> {
  const sections = await loadSections();
  const model = await describeActiveModel();

  // Nothing uploaded yet - stay general rather than failing.
  if (sections.length === 0) {
    const { note } = await writeNote(update, []);
    return { note, groundedIn: null, general: true, model, inputHash: noteInputHash(update, []) };
  }

  const chosen = await selectSections(update, sections);
  const inputHash = noteInputHash(update, chosen.map((c) => c.id));

  if (chosen.length === 0) {
    const { note } = await writeNote(update, []);
    return { note, groundedIn: null, general: true, model, inputHash };
  }

  const { note, grounded, section } = await writeNote(update, chosen);

  // The model itself judged the context not genuinely relevant.
  if (!grounded) {
    return { note, groundedIn: null, general: true, model, inputHash };
  }

  // Verify against the section the note was actually written from, not simply
  // the first shortlisted one. Checking the wrong section both mis-attributed
  // correct notes and failed them, so a genuine match was discarded and
  // rewritten as a general note.
  //
  // When the model did not name a section, every candidate is checked and the
  // first that holds is used. That is strictly better than assuming the first.
  const candidates = section !== null ? [chosen[section - 1]] : chosen;

  let verified: SectionRow | null = null;
  for (const candidate of candidates) {
    if (await verifyNote(update, note, candidate)) {
      verified = candidate;
      break;
    }
  }

  if (!verified) {
    // Claimed link did not hold against any candidate - fall back to an
    // ungrounded note rather than showing an unsupported connection.
    const fallback = await writeNote(update, []);
    return { note: fallback.note, groundedIn: null, general: true, model, inputHash };
  }

  return {
    note,
    groundedIn: {
      documentTitle: verified.context_documents?.title ?? 'Context document',
      docType: verified.context_documents?.doc_type ?? 'other',
      heading: verified.heading,
    },
    general: false,
    model,
    inputHash,
  };
}

/** Names the model currently answering, for recording against each note. */
async function describeActiveModel(): Promise<string> {
  try {
    const { getProviderStatus } = await import('../llm');
    const status = await getProviderStatus();
    return status.model ? `${status.provider}:${status.model}` : status.provider;
  } catch {
    return 'unknown';
  }
}

/**
 * Adds a "what this means for us" paragraph to an answer that came from
 * somewhere else, grounded in Litera's own context library.
 *
 * The ask box queries Crayon directly, so its answer is Crayon's reading of
 * Crayon's data: accurate about the competitor, but with no knowledge of our
 * roadmap, positioning or GTM strategy. It also carries Crayon's sourcing,
 * which can include unverified material. This wraps that answer in our own
 * context so a reader gets the competitor fact AND its relevance to us, and
 * reuses the same shortlist-then-verify path as feed notes so an ungroundable
 * answer says nothing rather than inventing a connection.
 *
 * Returns null when the library has nothing genuinely relevant. Callers should
 * show the original answer unchanged in that case.
 */
export async function groundExternalAnswer(
  question: string,
  answer: string
): Promise<RelevanceNote | null> {
  if (!answer.trim()) return null;

  // Framed as an update so the shortlist prompt, which is tuned to judge
  // concrete product/capability/segment overlap, applies unchanged.
  const framed = `Question asked: ${question}\n\nAnswer from our competitive intelligence provider:\n${answer}`;

  try {
    const result = await generateRelevanceNote(framed);
    // A general note here would just restate the answer without adding
    // anything, so it is not worth showing.
    return result.general ? null : result;
  } catch (err) {
    // The answer itself is still useful; losing the commentary is not a reason
    // to fail the question.
    console.warn(
      `[ask] could not ground answer: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`
    );
    return null;
  }
}
