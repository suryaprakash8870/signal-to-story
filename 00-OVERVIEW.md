# Signal-to-Story Engine — Build Spec Package

This folder is the complete build spec for the Signal-to-Story Engine. Read
this file first — it tells you what order to build in and where everything
else lives.

## What this product does

Converts a raw competitive intelligence signal into audience-specific,
ready-to-use content for Sales, Product, Marketing, and Leadership — with a
mandatory human review step before anything is published. It does not
replace Crayon, Gong, or Salesforce. It automates the layer between signal
capture and audience-ready content.

## Spec files in this package

| File | Covers |
|---|---|
| `01-DATA-MODEL.md` | Full Postgres schema, indexes, RLS policies |
| `02-PIPELINE-STAGES.md` | The 6 pipeline stages, prompts, JSON schemas, grounding rules |
| `03-LLM-PROVIDER.md` | Claude API + local Ollama, provider abstraction, config |
| `04-CONNECTORS.md` | Teams, Gmail, Salesforce, Gong, Crayon — adapter pattern, test/live modes |
| `05-HUMAN-REVIEW-WORKFLOW.md` | Review queue, approval gate, RLS enforcement |
| `06-FRONTEND-SPEC.md` | Pages, routes, components |
| `07-API-ENDPOINTS.md` | REST endpoint contracts |
| `08-TEST-FIXTURES-AND-TESTING.md` | Sample data, how to test without live credentials |
| `09-BUILD-PHASES-AND-TASKS.md` | Phased task checklist, recommended build order |
| `10-OPTIMIZATION-NOTES.md` | Cost, performance, and query optimization |

## Tech stack (fixed — do not substitute without a reason documented in code)

- **Frontend:** Next.js + Tailwind
- **Backend/DB:** Supabase (Postgres, Auth, Row-Level Security, Vault)
- **AI, production:** Claude API (Anthropic) — `api.anthropic.com/v1/messages`
- **AI, dev/test only:** Local Ollama model, reachable over a private network
- **Hosting:** Vercel (frontend) + Supabase managed backend
- **Outbound distribution:** Microsoft Teams Incoming Webhooks; Gmail SMTP

## Build order — read this before writing any code

Do not build all pieces in parallel. Build in this order, and do not start
step N+1 until step N actually works with real (or fixture) data flowing
through it:

1. **Data model** (`01`) — create all tables, indexes, RLS policies first.
2. **One signal, all the way through, manually.** Build Stages 1–5 of the
   pipeline (`02`) against Ollama (`03`), with a minimal intake form and a
   minimal review queue (`05`) — no polish, just correctness. Confirm a
   single fixture signal (see `08`) produces a sane classification,
   interpretation, and packaged output, and that it cannot be published
   without going through the review gate.
3. **One distribution channel.** Wire Teams only (`04`) — approve an output
   in the review queue and confirm it posts. Do not build Gmail yet.
4. **Swap in Claude API** (`03`) for the packaging stage specifically, and
   re-run the same fixture signal. Confirm the grounding rule actually
   produces an `unverified_claims` entry when you feed it a fixture
   containing an unsupported claim — this is the one behavior that must be
   verified against Claude directly, not just Ollama (see `03`).
5. **Now widen:** add Gmail distribution, add the Salesforce/Gong/Crayon
   connector UI shells in Test Mode (`04`), add live talking-points output
   and configurable digest cadence (`02`), build out the full frontend
   (`06`) and API surface (`07`).
6. **Then** move to Phase 2/3 items in `09` (live connectors, analytics).

This order exists so that at every step there is one fully-working thing,
not five half-working things. Widening scope (step 5) is safe specifically
because steps 2–4 already proved the core loop end-to-end.

## Non-negotiable design rules (apply across every spec file)

1. **Nothing publishes without human approval.** Enforced at the database
   layer via RLS (`05`), not just in the UI.
2. **The model states what's grounded; anything else is flagged, not
   asserted.** This is the grounding rule in `02` — it is the single most
   important behavior in this system.
3. **Ollama is dev/test only.** Anything that could reach a real person at
   Litera goes through Claude API. This is a config flag (`03`), but it is
   a hard rule, not a suggestion.
4. **Connector credentials are never hardcoded or exposed to the browser.**
   Vault-stored, server-side only (`04`).
5. **Salesforce's field mapping is unconfirmed.** Build it as a config file
   the adapter reads from, not parsing logic tied to guessed field names
   (`04`, `08`).
