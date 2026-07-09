# 06 — Frontend Spec (Next.js)

## Routes

| Route | Purpose | Access |
|---|---|---|
| `/login` | Supabase Auth | Public |
| `/intake` | Submit a raw signal | submitter, reviewer, admin |
| `/review` | Review queue (see `05`) | reviewer, admin |
| `/signals/[id]` | Full detail: raw signal, classification, all outputs, review actions | reviewer, admin (read-only for submitter) |
| `/dashboard` | Published outputs, filterable by audience/competitor/date | all authenticated |
| `/settings/connectors` | Connectors page (see `04`) | admin |
| `/settings/competitors` | Manage `known_facts` per competitor | reviewer, admin |

## `/intake`

Minimal form: `raw_text` (textarea), `source_type` (select, from the
constrained list in `01-DATA-MODEL.md`), optional `source_ref` (link),
optional competitor tag if the submitter already knows it. On submit:
insert into `signals`, trigger Stage 2 (`02-PIPELINE-STAGES.md`)
server-side, redirect to `/signals/[id]` so the submitter can watch it
move through classification → interpretation → packaging.

Build this first, minimal, no polish — per the build order in `00-OVERVIEW.md`.

## `/review`

The query from `05-HUMAN-REVIEW-WORKFLOW.md`, rendered as a list sorted by
urgency. Each row: signal snippet, audience, output_type, urgency badge,
"unverified claims" badge if non-empty. Clicking a row opens `/signals/[id]`
scrolled to that specific output.

## `/signals/[id]`

The full picture for one signal:
- Raw signal text + source metadata
- Classification (competitor, signal_type, business_area, urgency,
  audience_relevance)
- Interpretation (signal_summary, why_it_matters)
- All generated outputs, grouped by audience, each with:
  - Content (editable inline if reviewer/admin)
  - Unverified claims list, each with a "Confirm" / "Remove" action
  - Approve / Reject buttons (disabled while unverified_claims is non-empty,
    matching the RLS block in `01`)

## `/dashboard`

Read-only view of everything with `published_at is not null`. Filters:
audience, competitor, date range. This is where someone checks "what's
gone out to Sales this month" without digging through Teams history.

## `/settings/connectors`

Six cards: Microsoft Teams, Gmail, Salesforce, Gong, Crayon, and an
"AI Provider" card showing the current `LLM_PROVIDER` setting (read-only
display — this is an environment variable, not something toggled from the
UI, per `03-LLM-PROVIDER.md`).

Each connector card shows: type, direction, mode (Test/Live badge),
status, a "Test Connection" button, and for outbound Gmail specifically, a
cadence selector (Weekly / Bi-weekly) writing to `connectors.cadence`.

For Salesforce/Gong/Crayon while in Test Mode: show a clear "Running in
Test Mode against sample data" state rather than a greyed-out disabled
card — this is real, working functionality (against fixtures), not a
placeholder.

## `/settings/competitors`

Simple CRUD on `competitors.known_facts` — this is what grounds Stage 3's
interpretation. Reviewer/admin only, per the RLS policy in `01`.

## Auth

Supabase Auth. Role (`submitter` / `reviewer` / `admin`) lives in
`user_profiles.role` and drives both RLS (`01`) and which routes/actions
are visible in the UI — but remember the RLS policy is the actual
enforcement; hiding a button in the UI is a convenience, not a security
boundary.
