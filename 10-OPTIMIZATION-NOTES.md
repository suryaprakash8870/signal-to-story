# 10 — Optimization Notes

These are concrete performance/cost optimizations. None of them should
compromise the deliberate design decisions elsewhere in this package
(stage separation for inspectability, mandatory review gate, grounding
rules) — optimization here means efficiency within those constraints, not
around them.

## LLM call efficiency

- **Run Stage 5 (Output Packaging) calls concurrently, not sequentially.**
  Each audience's output generation is independent — use
  `Promise.all(audiences.map(a => packageForAudience(signalId, a)))`
  rather than a loop with `await` inside it. This is the single biggest
  latency win available without changing the architecture.
- **Fetch `competitors.known_facts` once per pipeline run, not once per
  stage.** Stage 3 and every Stage 5 call need it — pass it through the
  orchestration context rather than re-querying the database on each call.
- **Dedupe on `raw_text_hash` before reclassifying.** If an identical
  signal is resubmitted (same hash, `status != 'rejected'`), surface the
  existing result instead of re-running the full pipeline and paying for
  four LLM calls again. The index in `01-DATA-MODEL.md` supports this
  check cheaply.
- **Cap `max_tokens` per stage deliberately** (see the 1500 default in
  `03-LLM-PROVIDER.md`) — these are short, structured outputs; an
  unbounded token limit mostly risks the model padding rather than adding
  value, and costs more per call.

## Database

- **Indexes already specified in `01-DATA-MODEL.md`:** `signals.status`,
  `signals.raw_text_hash`, `signal_outputs.signal_id`, and a partial index
  on `signal_outputs.approved` scoped to `approved = false` specifically
  because the review queue query (`05`) filters on that condition — a
  partial index keeps it small and fast even as approved history grows.
- **Do not `select *` from `signal_outputs` on the dashboard view** — it
  will grow large over time; select only the columns the dashboard
  actually renders.

## Connector polling (Phase 2, inbound)

- **Prefer webhooks over polling wherever the vendor supports it**
  (Crayon does) — polling Salesforce/Gong on a tight interval burns API
  quota for signals that arrive infrequently. A 15–30 minute poll interval
  is a reasonable default for Salesforce/Gong if webhooks aren't
  available; tune based on actual signal frequency once live.
- **Rate-limit and back off on 429s from any vendor API** — implement
  exponential backoff in the connector's `fetch()`/`push()`, not just a
  single retry.

## Distribution

- **Batch the Gmail digest, don't send per-signal.** The cadence-driven
  batching described in `04-CONNECTORS.md` (a scheduled job reading
  `connectors.cadence`) is both a UX decision (a digest, not a flood of
  emails) and a cost/efficiency one (one send per cadence period, not one
  per approved output).
- **Do not build an email-open-rate metric on Gmail SMTP** — it doesn't
  support tracking, and building UI/reporting around data that will never
  arrive is wasted effort. Use Teams reaction/engagement data as the
  adoption metric instead (see `09-BUILD-PHASES-AND-TASKS.md`).

## Observability (cheap to add now, expensive to retrofit later)

- Log every pipeline stage transition with `signal_id`, stage name,
  duration, and provider used (Ollama/Claude) — this is what makes it
  possible to answer "why did this signal take 40 seconds" or "which
  stage is actually expensive" without guessing.
- Log every schema-validation failure from the LLM provider, including the
  raw response that failed to parse — this is the fastest way to tighten
  a prompt when something goes wrong, rather than reconstructing it from
  a vague bug report later.
