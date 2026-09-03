# Data-Handling Policy (Phase 2 gate)

Per `09-BUILD-PHASES-AND-TASKS.md`: **define and apply a data-handling policy
for Gong/Salesforce content before any live connector starts sending real
customer-adjacent data to the LLM provider.** This document is that policy. It
must be reviewed and signed off before flipping any inbound connector from Test
to Live.

## Why this matters

In Test Mode, connectors read synthetic fixtures - no real customer data leaves
the system. In Live Mode, real Gong call transcripts and Salesforce opportunity
notes are sent to the LLM provider for classification, interpretation, and
packaging. That content can include customer names, deal terms, and
individuals' words. This policy governs how that data is handled.

## Provider rules

- **Production uses Claude API only.** Ollama is dev/test only
  (`03-LLM-PROVIDER.md`). Do not point Live connectors at a pipeline running on
  Ollama - set a Claude key first.
- **No training on our data.** Confirm the Anthropic account's data-usage terms
  (API inputs are not used for model training under standard commercial terms);
  keep that confirmation on file.
- **Ollama, if ever used with real data, stays on the trusted private LAN.**
  Its API has no auth - never expose that box publicly.

## Minimization

- **Send only what the pipeline needs.** The connectors already summarize
  source records into a `raw_text` field rather than forwarding entire raw API
  payloads. Keep it that way - do not widen `raw_text` to dump full transcripts
  or full note histories unless a specific stage needs it.
- **Redact where feasible before send.** For known high-sensitivity fields
  (individual names, direct quotes not needed for the competitive signal),
  prefer redaction at the connector's mapping step. Add redaction rules to the
  connector's `fetch()` mapping, not downstream.

## Access & storage

- **Credentials never touch the browser.** All connector credentials and the
  Claude key are stored in Supabase Vault, resolved server-side only
  (`04-CONNECTORS.md`).
- **RLS governs who sees signals.** Only authenticated users read signals;
  only reviewers/admins approve. Do not add service-role reads to client code.
- **Retention.** Decide and document how long raw signals and outputs are kept.
  Rejected signals are retained for analysis (`05`), but set a retention window
  for raw customer-adjacent `raw_text` and purge past it.

## Per-connector notes

- **Salesforce** - field mapping is unconfirmed. Confirm object/field names
  with Litera's Salesforce admin and set them in `connectors.config` before
  Live. Query only the fields the mapping needs (the SOQL is built from config,
  so keep the field list minimal).
- **Gong** - transcripts are the most sensitive source (verbatim customer
  speech). Strongly prefer sending the summarized `raw_text`, not full
  transcripts. Confirm Gong API access tier and any internal approval for
  processing call data.
- **Crayon** - competitor/public web data, lowest sensitivity. Prefer the
  outbound webhook over polling.

## Sign-off

Do not enable Live Mode for a connector until the owner has confirmed the above
for that connector. Record the date and approver here:

| Connector  | Approved by | Date | Notes |
|------------|-------------|------|-------|
| Salesforce |             |      |       |
| Gong       |             |      |       |
| Crayon     |             |      |       |
