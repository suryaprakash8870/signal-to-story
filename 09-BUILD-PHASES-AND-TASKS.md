# 09 - Build Phases and Tasks

See `00-OVERVIEW.md` for the recommended build *order* within Phase 1 -
this file is the task checklist once that order is underway.

## Phase 1 - Core Pipeline + Connectors in Test Mode

- [ ] Data model: all tables, indexes, RLS policies (`01`)
- [ ] Intake form, minimal (`06`)
- [ ] Stages 2–5 wired to Ollama (`02`, `03`)
- [ ] Review queue, minimal, with RLS-enforced approval gate (`05`)
- [ ] One fixture signal moving end-to-end, approved, confirmed in the database
- [ ] Teams connector live, one approved output posts successfully (`04`)
- [ ] Swap to Claude API for packaging; re-run grounding test from `08`
- [ ] Gmail connector live, cadence-driven digest sending (`04`)
- [ ] Salesforce/Gong/Crayon connector UI + adapters in Test Mode against
      fixtures (`04`, `08`)
- [ ] Live talking-points output type, routed alongside the Sales talk
      track (`02`)
- [ ] Full frontend: dashboard, connectors settings, competitors CRUD (`06`)
- [ ] Full API surface (`07`)

**Definition of done for Phase 1:** a real person can submit a signal (or
one arrives via a Test Mode connector), it gets classified, interpreted,
routed, packaged - including a live talking-points version - sits in the
review queue ordered by urgency, gets approved by a reviewer, and reaches
both Teams and (on its scheduled cadence) the Gmail digest. Salesforce,
Gong, and Crayon connectors exist and work against fixture data, clearly
labeled as Test Mode.

## Phase 2 - Connectors Go Live

- [ ] Confirm Salesforce object/field names with Litera's admin; update
      `connectors.config` from the placeholder to the real mapping
- [ ] Confirm Gong API access tier on Litera's plan
- [ ] Confirm Crayon webhook/API access
- [ ] Switch each connector's `mode` from `test` to `live` independently,
      as each is confirmed - no pipeline code changes required
- [ ] Define and apply a data-handling policy for Gong/Salesforce content
      before any live connector starts sending real customer-adjacent data
      to the LLM provider

## Phase 3 - Feedback & Analytics

- [ ] Approval-rate and edit-rate tracking per output type (data already
      captured in `signal_outputs`; build the reporting view)
- [ ] Review-queue throughput tracking - flag if it trends upward, per
      the note in `05-HUMAN-REVIEW-WORKFLOW.md`
- [ ] Teams reaction/engagement tracking as the primary adoption metric
      (Gmail has no open tracking - see `10-OPTIMIZATION-NOTES.md`)
- [ ] Prompt refinement loop, driven by the above data

## Open decisions that block specific tasks above (do not guess these - confirm with stakeholders)

- Who is the designated reviewer/approver for Phase 1 - single owner or
  rotating role? (Blocks: assigning the `reviewer` role in `user_profiles`.)
- Weekly or bi-weekly digest cadence? (Blocks: default value for
  `connectors.cadence`.)
- Which Phase 2 connector goes live first? (Blocks: Phase 2 task ordering.)
- Who owns and maintains `competitors.known_facts`? (Blocks: who gets the
  `reviewer` or `admin` role specifically for `/settings/competitors`.)
