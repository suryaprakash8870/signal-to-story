# 07 - API Endpoints

Next.js API routes (or route handlers under `app/api/`). All routes below
require an authenticated Supabase session; role checks are enforced by RLS
on the underlying tables (`01-DATA-MODEL.md`), not re-implemented here.

## Signals

| Method | Route | Body | Notes |
|---|---|---|---|
| `POST` | `/api/signals` | `{ raw_text, source_type, source_ref? }` | Creates the signal, triggers Stage 2 async |
| `GET` | `/api/signals/:id` | - | Full detail: signal + classification + outputs |
| `GET` | `/api/signals` | query: `status?`, `source_type?` | List/filter |

## Pipeline (internal - called by the signal creation flow, not directly by the frontend)

| Function | Input | Output |
|---|---|---|
| `classifySignal(signalId)` | signal id | writes `signal_classification`, sets status |
| `interpretSignal(signalId)` | signal id | writes interpretation fields, sets status |
| `routeAudiences(signalId)` | classification | deterministic, no LLM call - see `02` Stage 4 |
| `packageOutputs(signalId)` | interpretation + routed audiences | writes `signal_outputs` rows, one call per audience, run concurrently (`10-OPTIMIZATION-NOTES.md`) |

These run server-side as a single orchestrated job triggered by
`POST /api/signals` - not exposed as individual public endpoints.

## Review

| Method | Route | Body | Notes |
|---|---|---|---|
| `PATCH` | `/api/outputs/:id/approve` | - | Blocked by RLS if `unverified_claims` non-empty |
| `PATCH` | `/api/outputs/:id/edit` | `{ content }` | Reviewer edits before approving |
| `PATCH` | `/api/outputs/:id/reject` | `{ reason? }` | |
| `PATCH` | `/api/outputs/:id/resolve-claim` | `{ claim_index, action: "confirm" \| "remove" }` | Updates `unverified_claims`; may unblock approval |

## Distribution

| Method | Route | Body | Notes |
|---|---|---|---|
| `POST` | `/api/outputs/:id/publish` | - | Only callable if `approved = true`; pushes via the relevant connector (`04-CONNECTORS.md`), sets `published_at` |

## Connectors

| Method | Route | Body | Notes |
|---|---|---|---|
| `GET` | `/api/connectors` | - | List all six with status/mode |
| `POST` | `/api/connectors/:type/test` | - | Calls `testConnection()` |
| `PATCH` | `/api/connectors/:type` | `{ mode?, config?, cadence? }` | Admin only, per RLS |
| `POST` | `/api/connectors/:type/credentials` | `{ value }` | Writes to Vault, stores only the reference in `credentials_ref` - never logs or echoes the raw value |

## Competitors

| Method | Route | Body | Notes |
|---|---|---|---|
| `GET` | `/api/competitors` | - | |
| `POST` | `/api/competitors/:id/facts` | `{ fact, source }` | Appends to `known_facts` jsonb array |

## Error handling convention

Every pipeline-stage function should catch schema-validation failures
from the LLM provider (`03-LLM-PROVIDER.md`) and retry once before setting
`signals.status = 'error'`. Surface errored signals in `/review` with a
distinct badge - don't let them silently vanish from the queue.
