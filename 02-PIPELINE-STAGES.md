# 02 — Pipeline Stages

The pipeline is a linear chain: Classification → Interpretation → Audience
Routing → Output Packaging. Each stage is a distinct LLM call (via the
provider in `03-LLM-PROVIDER.md`). Do not merge stages into fewer calls —
the separation is deliberate so any single stage can be re-run without
re-running the others, and so each stage is independently inspectable when
something looks wrong.

## Shared rule across every stage: structured output only

Every system prompt below must end with an explicit instruction like:

> Return only a single valid JSON object matching the schema below. No
> preamble, no explanation, no markdown code fences — just the JSON object.

Validate every response against a schema (Zod on the Node side) before
writing to the database. If validation fails, retry once with the
validation error appended to the prompt; if it fails twice, mark the
signal `status = 'error'` and surface it in the review queue rather than
silently dropping it.

## Shared rule across every stage: grounding

This is the most important behavior in the whole system. Every prompt that
generates interpretive or audience-facing content (Stages 3 and 5) must
include this instruction, verbatim or equivalent:

> Only state as fact what is directly supported by the raw signal text or
> the competitor's known_facts below. Any claim that goes beyond
> that — inference, speculation, or general knowledge — must be placed in
> the `unverified_claims` array, not stated as settled fact in the main
> content.

This rule must be tested against Claude API specifically before it is
trusted — see `08-TEST-FIXTURES-AND-TESTING.md`. Ollama testing validates
that the pipeline plumbing works; it does not validate that this specific
instruction-following behavior is reliable.

---

## Stage 2: Classification

**Input:** `signals.raw_text`, list of known competitors (id + name only).

**System prompt (skeleton):**

```
You are classifying a raw competitive intelligence signal for Litera, a
legal technology company.

Known competitors: {competitor_list}

Given the raw signal below, return a JSON object with:
- competitor: string (must match one of the known competitors, or "Unknown")
- signal_type: string (e.g. pricing, product_launch, messaging, win_loss)
- business_area: string (which part of Litera's business this touches)
- urgency: "low" | "medium" | "high"
- audience_relevance: object with keys sales, product, marketing, leadership,
  each valued "low" | "medium" | "high"

Return only the JSON object, no other text.

Raw signal:
{raw_text}
```

**Output schema:**

```json
{
  "competitor": "string",
  "signal_type": "string",
  "business_area": "string",
  "urgency": "low | medium | high",
  "audience_relevance": {
    "sales": "low | medium | high",
    "product": "low | medium | high",
    "marketing": "low | medium | high",
    "leadership": "low | medium | high"
  }
}
```

Write directly to `signal_classification`. Set `signals.status = 'classified'`.

---

## Stage 3: Interpretation

**Input:** raw signal, Stage 2 output, `competitors.known_facts` for the
matched competitor.

**System prompt (skeleton):**

```
You are explaining what a competitive signal means for Litera.

Raw signal: {raw_text}
Classification: {stage_2_output}
Known facts about {competitor}: {known_facts}

Return a JSON object with:
- signal_summary: a plain-language summary of what happened
- why_it_matters: why this matters to Litera specifically
- unverified_claims: array of strings — any claim in your summary or
  implication that is NOT directly supported by the raw signal or the
  known facts above. If everything is fully supported, return an empty array.

Only state as fact what the raw signal or known facts directly support.
Return only the JSON object.
```

**Output schema:**

```json
{
  "signal_summary": "string",
  "why_it_matters": "string",
  "unverified_claims": ["string", "..."]
}
```

Set `signals.status = 'interpreted'`.

---

## Stage 4: Audience Routing

Not a separate LLM call — a rule layer over Stage 2's `audience_relevance`
scores. Deterministic logic, not a model call, so keep it cheap and
predictable:

```
for each audience in [sales, product, marketing, leadership]:
  if audience_relevance[audience] == "high": auto-queue for packaging
  if audience_relevance[audience] == "medium": queue for packaging,
    but flag as "reviewer discretion" in the review queue UI
  if audience_relevance[audience] == "low": do not generate an output
    for this audience
```

---

## Stage 5: Output Packaging

**Input:** Stage 3 output, per-audience, run once per routed audience.
These calls are independent of each other — see `10-OPTIMIZATION-NOTES.md`
for running them concurrently rather than sequentially.

**Per-audience output types:**

| Audience | Output type(s) generated |
|---|---|
| Sales | `talk_track`, `battlecard_snippet`, `live_talking_points` |
| Product | `watchout` |
| Marketing | `marketing_angle` |
| Leadership | `leadership_summary` |

**System prompt (skeleton, Sales example):**

```
You are writing Sales-facing content from a competitive signal.

Signal summary: {signal_summary}
Why it matters: {why_it_matters}
Unverified claims (do not present these as settled fact): {unverified_claims}

Return a JSON object with:
- talk_track: a short, confident talking point a Sales rep can use in a
  live conversation, grounded only in the signal summary above
- battlecard_snippet: an objection/response pair formatted as
  "Objection: ... Response: ..."
- live_talking_points: a 1-2 minute spoken-style summary suitable for a
  live meeting update (e.g. a weekly revenue sync), not a written post

Do not state the unverified claims as fact. If a claim is unverified,
either omit it or phrase it explicitly as something to confirm, not as
settled fact. Return only the JSON object.
```

Repeat with audience-appropriate prompts for `watchout`, `marketing_angle`,
`leadership_summary`. Each generated output row also carries forward any
`unverified_claims` from Stage 3 into `signal_outputs.unverified_claims` —
this is what the database-level approval block in `01-DATA-MODEL.md`
checks against.

Set `signals.status = 'packaged'` once all routed outputs are generated.
Human review (`05-HUMAN-REVIEW-WORKFLOW.md`) happens next — Stage 6
(Distribution, `04-CONNECTORS.md`) only fires after `approved = true`.
