import { getLLMProvider } from '../llm';
import {
  salesPackagingSchema,
  productPackagingSchema,
  marketingPackagingSchema,
  leadershipPackagingSchema,
} from '../llm/schemas';
import { withOneRetry } from './retry';
import {
  guardOutputs,
  isRawDump,
  stripAccountName,
  foreignEntity,
  fixProductContradiction,
  type DraftOutput,
  type GuardContext,
} from './verify';
import { literaFactsBlock } from './litera-facts';
import { mapLimit } from './concurrency';
import { supabaseServiceRole } from '../supabase/server';
import type { LLMProvider } from '../llm/provider';
import type { Interpretation } from '../llm/schemas';
import type { Audience, RoutingDecision } from './route';

// Grounding rules appended to every packaging prompt. These are PREVENTION (the
// Quality Gate in verify.ts is the cure). Order matters: the Litera + entity
// rules come first because a fabricated Litera cert is the most damaging error.
const GROUNDING_TAIL =
  'STRICT GROUNDING RULES:\n' +
  '- LITERA: Only state facts about Litera that appear above, either in ' +
  '"Confirmed facts about Litera" or in "LITERA\'S OWN DOCUMENTS". Where those ' +
  'documents cover the need in this signal, NAME the Litera product or ' +
  'capability that answers it and say what it does - that is the whole point of ' +
  'having them. Do NOT claim, imply, or invent any Litera capability, ' +
  'certification, product, feature, price, security posture, track record, or ' +
  'strength that is not listed. This includes VAGUE claims ("robust security", ' +
  '"proven track record", "enterprise-grade", "seamless integration") and ' +
  'IMPLIED claims ("we can meet their need for X", "our solution delivers X", ' +
  '"position ourselves as a reliable partner with X"). When your point would need ' +
  'such a fact, do NOT assert it. Instead simply REPORT, as plain information, ' +
  'what the customer ACTUALLY asked for or raised IN THIS SIGNAL (using only the ' +
  'exact things they mentioned - do NOT add specifics they did not say) so the ' +
  'rep is informed and can decide. Do NOT add any "confirm Litera\'s position" ' +
  'instruction or bracketed flag - just state what happened and what the client ' +
  'asked, in their own terms.\n' +
  '- ENTITY: Never attribute the competitor\'s features, products, or claims to ' +
  'Litera. They belong to the competitor, not Litera. Do NOT introduce any ' +
  'vendor or company that the source signal does not mention. You MAY name a ' +
  'third party the SOURCE itself names - an integration, a platform, a partner ' +
  '- because that is part of what happened; keep it, do not generalise it away ' +
  '("iManage documents" must not become "documents").\n' +
  '- COMPETITOR INFERENCE: State as fact ONLY what the source signal directly ' +
  'says about the competitor. If you draw a conclusion that goes beyond the ' +
  'source (what a move "indicates", "means", or where it is "heading"), word it ' +
  'explicitly as inference - "may", "suggests", "appears" - never as an ' +
  'established fact. A confidently stated guess (e.g. "indicating a newer US ' +
  'presence") could be repeated to a customer as truth, so mark it as inference ' +
  'or leave it out.\n' +
  '- PERSPECTIVE: Only the sales talk_track is spoken directly to the customer ' +
  '(address them as "you"). EVERY other output - battlecard, live_talking_points, ' +
  'watchout, marketing_angle, leadership_summary - is INTERNAL enablement for a ' +
  'Litera team; refer to the customer in the THIRD PERSON ("the client", "the ' +
  'firm"), never "you".\n' +
  '- BE SPECIFIC, NOT GENERIC: Anchor every sentence in the CONCRETE details of ' +
  'THIS signal - the competitor\'s actual move, the specific hook, and the ' +
  'specific gap or opportunity it creates. Name the real thing. BANNED filler ' +
  '(never use these): "stay attuned", "remain relevant", "stay ahead", "in ' +
  'today\'s evolving landscape", "proactively engage", "tailor our solution", ' +
  '"meet their needs", "unique solution", "navigate the changing market", "clear ' +
  'outcomes" (unless you name the specific outcome). If you cannot say something ' +
  'concrete and signal-specific, write less rather than padding.\n' +
  '- Do not state the unverified claims as fact; if a claim is unverified, leave ' +
  'it out (do not mention it, and do not write meta-instructions like "verify ' +
  'pricing").\n' +
  '- Write concise, ORIGINAL text in your own words - do NOT copy sentences, ' +
  'headers, or dialogue from the source signal.\n' +
  '- MATCH YOUR CERTAINTY TO THE EVIDENCE: a launch, webpage, demo, or single call ' +
  'is an EARLY signal to watch, NOT a proven market threat. Avoid alarmist or ' +
  'absolute language ("will upend", "dominate", "destroy our stronghold") unless ' +
  'the signal proves it; prefer measured phrasing ("worth watching", "a new ' +
  'entrant", "early-stage").\n' +
  'The content must read as finished, ready-to-send competitive intel. Return ' +
  'only the JSON object.';

interface PackContext {
  interp: Interpretation;
  competitorName: string;
  competitorFacts: unknown[];
  literaFacts: string;
  /** The original signal, so detail lost in summarising can still be reached. */
  rawText: string;
  /** Passages from Litera's own documents that bear on this signal. */
  literaContext: string;
}

function sharedContext(ctx: PackContext) {
  const parts = [
    // The source itself, first. Packaging used to see only the summary and the
    // "why it matters" line, so anything dropped while interpreting was gone
    // for good and could not be recovered no matter how the prompts were
    // worded.
    `SOURCE SIGNAL (the record of what actually happened):\n${ctx.rawText}`,
    `Signal summary: ${ctx.interp.signal_summary}`,
    `Why it matters: ${ctx.interp.why_it_matters}`,
    `Competitor in this signal: ${ctx.competitorName}`,
  ];

  // Omitted when empty rather than sent as "[]". It is empty for all 50
  // competitors today, and an empty list reads as "there is nothing to know
  // about them", which is not what it means.
  if (ctx.competitorFacts.length > 0) {
    parts.push(`Known facts about ${ctx.competitorName}: ${JSON.stringify(ctx.competitorFacts)}`);
  }

  if (ctx.literaContext) {
    parts.push(
      `LITERA'S OWN DOCUMENTS (the only source for what Litera does. Use these ` +
        `to say what Litera already offers, by name, rather than telling the rep ` +
        `to go and find out):\n${ctx.literaContext}`
    );
  } else {
    parts.push(`Confirmed facts about Litera (the ONLY Litera facts you may state): ${ctx.literaFacts}`);
  }

  parts.push(
    `Unverified claims (do not present these as settled fact): ${JSON.stringify(
      ctx.interp.unverified_claims
    )}`
  );

  return parts.join('\n');
}

type OutputRow = { output_type: string; content: string };

async function packageForAudience(
  audience: Audience,
  ctx: PackContext,
  llm: LLMProvider
): Promise<OutputRow[]> {
  switch (audience) {
    case 'sales': {
      const result = await withOneRetry((extra) =>
        llm.generateStructured({
          systemPrompt: 'You write Sales-facing content from a competitive signal. Respond with JSON only.',
          userPrompt: `You are writing Sales-facing content from a competitive signal.

${sharedContext(ctx)}

Return a JSON object with:
- talk_track: ONE short line a rep would actually SAY OUT LOUD to this customer,
  in the moment - spoken and natural, naming the competitor's specific move and
  the specific angle to take. Not a description of the situation; the actual words.
- battlecard_snippet: an objection/response pair formatted as
  "Objection: ... Response: ...". The objection MUST be the specific
  competitive angle raised by THIS signal (name the competitor and their
  actual hook). For the response: if the signal reveals a COMPETITOR WEAKNESS
  (e.g. weak or unproven security, a newer/smaller/unestablished vendor, no
  formal or committed pricing, a missing capability, or a concern the customer
  raised about them), the response MUST LEAD with that specific weakness -
  quote the concrete detail from the signal. Do NOT fall back to generic filler
  like "we tailor our solution to your needs" or "we meet your exact
  requirements". Counter using ONLY the source facts and confirmed Litera
  facts - if the natural counter would need a Litera fact you do not have, do
  not invent it; instead just note what the client asked/raised as information.
  Never claim a Litera certification or feature that is not listed
- live_talking_points: a short spoken briefing for the rep's own team sync -
  cover, concretely: what the competitor did (the specific move), why it matters
  for THIS account specifically, and the specific next step. Spoken style, no
  filler.

${GROUNDING_TAIL}${extra ? `\n${extra}` : ''}`,
          schema: salesPackagingSchema,
        })
      );
      return [
        { output_type: 'talk_track', content: result.talk_track },
        { output_type: 'battlecard_snippet', content: result.battlecard_snippet },
        { output_type: 'live_talking_points', content: result.live_talking_points },
      ];
    }
    case 'product': {
      const result = await withOneRetry((extra) =>
        llm.generateStructured({
          systemPrompt: 'You write Product-facing content from a competitive signal. Respond with JSON only.',
          userPrompt: `You are writing a Product "watchout" from a competitive signal.

${sharedContext(ctx)}

Return a JSON object with:
- watchout: EXACTLY ONE of these two, never both:
  (a) If the signal reveals a concrete product implication - a specific
      capability the competitor now has, a specific gap it exposes, or a roadmap
      question - state THAT specifically. Do NOT also say there is no implication.
  (b) ONLY if the signal is purely positioning/marketing with NO product
      substance at all, say exactly one line: "No direct product implication -
      this is a messaging/positioning move, not a capability gap." and nothing
      about a gap.
  A signal that mentions a real competitor feature/capability is case (a).
  This output is for people who BUILD the product. Write about the product:
  the capability the competitor now has, how it compares to what Litera's
  documents say Litera offers, the gap if there is one, or the roadmap question
  it raises. Advice about how the field should talk to customers is Sales and
  Leadership work, not this - never answer with "provide field guidance",
  "give the team language" or similar. If Litera's documents name something
  that already addresses this, say which and how it compares.

${GROUNDING_TAIL}${extra ? `\n${extra}` : ''}`,
          schema: productPackagingSchema,
        })
      );
      return [{ output_type: 'watchout', content: result.watchout }];
    }
    case 'marketing': {
      const result = await withOneRetry((extra) =>
        llm.generateStructured({
          systemPrompt: 'You write Marketing-facing content from a competitive signal. Respond with JSON only.',
          userPrompt: `You are writing a Marketing angle from a competitive signal.

${sharedContext(ctx)}

Return a JSON object with:
- marketing_angle: the SPECIFIC positioning or messaging opportunity THIS signal
  opens for us. Name the concrete gap or counter-narrative - e.g. "the competitor
  is winning on narrative but their product doesn't back the claim, so lead with
  proof/outcomes" or "they are defining the category around X; reframe it around
  Y". Describe the actual angle we could take and WHY it works given this signal,
  not a generic call to 'stay relevant'. If a strong angle would need a Litera
  positioning fact you don't have, do not invent it - just describe the market
  opening and what the competitor is doing.

IMPORTANT for marketing - this is MARKET POSITIONING only:
- Do NOT name the specific customer, prospect, or account, and do NOT frame it
  around a specific deal ("a firm is considering X"). Generalize to the market.
- Do NOT include account or sales tactics (pricing offers, "their budget", "the
  account", pilot/renewal mechanics). Those belong to Sales, not Marketing.
- Write about the category, the competitor's positioning move, and the specific
  angle we could take.

${GROUNDING_TAIL}${extra ? `\n${extra}` : ''}`,
          schema: marketingPackagingSchema,
        })
      );
      return [{ output_type: 'marketing_angle', content: result.marketing_angle }];
    }
    case 'leadership': {
      const result = await withOneRetry((extra) =>
        llm.generateStructured({
          systemPrompt: 'You write Leadership-facing summaries from a competitive signal. Respond with JSON only.',
          userPrompt: `You are writing a Leadership summary from a competitive signal.

${sharedContext(ctx)}

Return a JSON object with:
- leadership_summary: the executive "so what" - lead with what is concretely at
  stake for Litera because of THIS signal (a specific account, deal, or market
  position), then the specific implication or decision it raises. Two or three
  tight sentences, no filler, no generic "monitor and stay competitive" padding.
  The decision must be a CHOICE an executive makes - a direction to take, a
  trade-off to settle, something to fund or stop. "Provide guidance to the
  field", "set expectations for the team", "define how teams should respond" and
  anything else that amounts to "somebody should write instructions" is NOT a
  decision; it is the absence of one. If the only honest answer is that nothing
  needs deciding yet, say what would have to change for it to matter, and say it
  in one line.
  Strip the engineering detail. Index names, API names, schema and
  configuration specifics belong to Product, not here. An executive needs the
  market consequence, not the mechanism.

${GROUNDING_TAIL}${extra ? `\n${extra}` : ''}`,
          schema: leadershipPackagingSchema,
        })
      );
      return [{ output_type: 'leadership_summary', content: result.leadership_summary }];
    }
  }
}

// How many model calls to keep in flight at once during packaging. Low on
// purpose: a rate-limited API and a single Ollama both choke on a big burst.
const STAGE5_CONCURRENCY = 2;

/**
 * Stage 5 - Output Packaging + the always-on Quality Gate.
 * 1. Packages one call per routed audience (paced), grounded in the signal,
 *    the competitor facts, and the (possibly empty) confirmed Litera facts.
 * 2. Re-packages an audience once if its outputs came back as a raw copy of
 *    the source.
 * 3. QUALITY GATE (runs on EVERY signal): guardOutputs re-checks all outputs
 *    in one batched call - strips unsupported claims, turns unconfirmed Litera
 *    facts into "[Rep to confirm: ...]" notes, blocks entity mix-ups, and keeps
 *    the customer name out of marketing. If it can't return a clean version of
 *    every output, the whole signal errors (clean-or-error, no silent bad copy).
 * 4. Free deterministic backstop: strip any lingering customer name from
 *    marketing outputs.
 */
export async function packageOutputs(
  signalId: string,
  interp: Interpretation,
  routing: Record<Audience, RoutingDecision>
): Promise<void> {
  const db = supabaseServiceRole();
  const audiences = (Object.keys(routing) as Audience[]).filter((a) => routing[a] !== 'skip');

  // Source material for grounding + the gate: raw signal + matched competitor.
  const { data: signal } = await db.from('signals').select('raw_text').eq('id', signalId).single();
  const rawText = signal?.raw_text ?? '';
  let competitorName = 'Unknown';
  let competitorFacts: unknown[] = [];
  const { data: classification } = await db
    .from('signal_classification')
    .select('competitor_id')
    .eq('signal_id', signalId)
    .maybeSingle();
  if (classification?.competitor_id) {
    const { data: comp } = await db
      .from('competitors')
      .select('name, known_facts')
      .eq('id', classification.competitor_id)
      .maybeSingle();
    if (comp) {
      competitorName = comp.name ?? 'Unknown';
      competitorFacts = comp.known_facts ?? [];
    }
  }

  // Every OTHER competitor on record - none of these may appear in an output for
  // THIS signal (deterministic guard against cross-signal entity bleed).
  //
  // Except the ones the source itself names. 46 of the 50 are legal software
  // firms that integrate with each other, so one feed item in thirteen mentions
  // a second tracked competitor - DraftWise with NetDocuments, Draftable with
  // iManage. Listing those as forbidden made the gate rewrite a grounded fact
  // out of the copy, which is how "iManage documents" became "documents" on the
  // Entegrata signal, and the deterministic guard would then have failed the
  // whole signal for any that survived.
  const { data: allComps } = await db.from('competitors').select('name');
  const named = (n: string) =>
    new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(rawText);
  const otherCompetitors = (allComps ?? [])
    .map((c) => c.name as string)
    .filter((n) => n && n.toLowerCase() !== competitorName.toLowerCase() && !named(n));

  const literaFacts = literaFactsBlock();

  // What Litera's own documents say about this signal, retrieved the same way
  // the Feed retrieves it. Failure here is never a reason to fail a signal:
  // an empty result simply restores the previous assume-nothing behaviour.
  let literaContext = '';
  try {
    const { literaContextFor } = await import('../context/relevance');
    literaContext = await literaContextFor(
      `${interp.signal_summary}\n${interp.why_it_matters}\n${rawText}`
    );
  } catch (err) {
    console.warn(
      `[package] no Litera context: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const ctx: PackContext = {
    interp,
    competitorName,
    competitorFacts,
    literaFacts,
    rawText,
    literaContext,
  };

  const llm = await getLLMProvider();

  // Package each routed audience (paced); retry an audience once if its outputs
  // are raw copies of the source.
  const rowsByAudience = await mapLimit(audiences, STAGE5_CONCURRENCY, async (audience) => {
    let rows = await packageForAudience(audience, ctx, llm);
    const dumps = (rs: OutputRow[]) => rs.filter((r) => isRawDump(r.content, rawText)).length;
    if (dumps(rows) > 0) {
      try {
        const retryRows = await packageForAudience(audience, ctx, llm);
        if (dumps(retryRows) < dumps(rows)) rows = retryRows;
      } catch {
        // keep the first attempt if the retry errors
      }
    }
    return { audience, rows };
  });

  const flatRows: { audience: Audience; row: OutputRow }[] = rowsByAudience.flatMap(({ audience, rows }) =>
    rows.map((row) => ({ audience, row }))
  );

  // QUALITY GATE - always runs. One batched call enforces every grounding rule.
  const drafts: DraftOutput[] = flatRows.map(({ audience, row }, index) => ({
    index,
    audience,
    output_type: row.output_type,
    content: row.content,
  }));
  const guardCtx: GuardContext = {
    rawText,
    competitorName,
    competitorFacts,
    // The gate must be given the SAME view of Litera the packaging stage had.
    // It was handed the empty "assume nothing" block while packaging had the
    // documents, so it dutifully deleted every Litera product the drafts named.
    // Retrieval worked and the output still said nothing: Foundation Finance
    // and Foundation Scoping came back for the Entegrata signal and neither
    // reached a card.
    literaFacts: literaContext || literaFacts,
    subjectAccount: interp.subject_account,
    otherCompetitors,
  };
  const guardedMap = await guardOutputs(drafts, guardCtx, llm);

  // CLEAN-OR-ERROR: if the gate couldn't return a clean version of every output
  // (model unavailable/bad response), fail the whole signal - no silent fallback.
  const allClean = flatRows.every((_, i) => guardedMap.has(i));
  if (!allClean) {
    throw new Error(
      'Quality gate could not clean all outputs (model unavailable or bad response). Retry, or switch to a working model.'
    );
  }

  const insertRows = flatRows.map(({ audience, row }, index) => {
    let content = guardedMap.get(index)!;

    // Deterministic backstop (Rule 4): no customer name in marketing.
    if (audience === 'marketing') {
      content = stripAccountName(content, interp.subject_account);
    }

    // Deterministic backstop (product self-contradiction): if a product output
    // asserts a real gap AND says "no product implication", drop the escape line.
    if (audience === 'product') {
      content = fixProductContradiction(content);
    }

    // Deterministic backstop (Invariant 3 - one competitor): a foreign vendor
    // name that survived the gate must never ship → fail the whole signal.
    const bleed = foreignEntity(content, otherCompetitors, rawText);
    if (bleed) {
      throw new Error(
        `The "${audience}" ${row.output_type} referenced an unrelated competitor "${bleed}" not in this signal. Retry, or switch to a stronger model.`
      );
    }

    // A raw copy of the source that survived → fail the whole signal.
    if (isRawDump(content, rawText)) {
      throw new Error(
        `The "${audience}" ${row.output_type} came back as a copy of the source instead of a summary. Retry, or switch to a stronger model.`
      );
    }

    return {
      signal_id: signalId,
      audience,
      output_type: row.output_type,
      content,
      // Outputs are always clean here (gated) or the signal errored above.
      unverified_claims: [] as string[],
    };
  });

  if (insertRows.length > 0) {
    const { error } = await db.from('signal_outputs').insert(insertRows);
    if (error) throw new Error(`failed to write signal_outputs: ${error.message}`);
  }

  await db.from('signals').update({ status: 'packaged' }).eq('id', signalId);
}
