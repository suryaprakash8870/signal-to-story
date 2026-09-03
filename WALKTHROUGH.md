# Signal-to-Story Engine - Walkthrough

A step-by-step tour to exercise everything built so far. Sample inputs are in
`SAMPLE-INPUTS.md`.

## 0. Prerequisites

- Dev server running on **http://localhost:3010** (`npm run dev` from
  `D:\signal-to-story`, or the `signal-to-story` preview config).
- An LLM reachable. Current config (`.env.local`): local Ollama
  `qwen2.5:7b`. To use the LAN 14B box, set `OLLAMA_BASE_URL=http://192.168.31.28:11434`
  and `OLLAMA_MODEL=qwen2.5:14b`, then restart the server.
- Login: **design.kraftylumin@gmail.com** / **SignalStory2026!** (role: reviewer).

> Tip: the pipeline runs 5 model calls per signal (classify, interpret, then
> up to 4 packaging calls). On the 7B model that can take a couple of minutes;
> the 14B box is faster. Don't restart the server while a signal is mid-pipeline
> - that orphans it at whatever stage it reached.

---

## 1. Sign in

1. Go to **http://localhost:3010/login**.
2. Enter the credentials above → you land on `/intake`.

## 2. Submit a signal (the core loop)

1. On **/intake**, paste sample #1 (Gong) from `SAMPLE-INPUTS.md`.
2. Set source type to **gong**, click **Submit signal**.
3. You're redirected to **/signals/[id]**, which polls every 2s. Watch the
   status badge move: `classified` → `interpreted` → `packaged`.

**What to verify:**
- **Classification** appears: competitor (LegalEdge), signal_type
  (product_launch), business_area, urgency, and per-audience relevance.
- **Outputs** appear grouped by audience once packaged. Sales gets three
  (talk_track, battlecard_snippet, live_talking_points); other audiences get
  their one type. Audiences scored `low` are skipped entirely.
- Each output shows an **Unverified claims** box if the model flagged any
  inferences - this is the grounding rule working.

## 3. The approval gate (the main safety control)

On the signal detail page, on any output with unverified claims:

1. The **Approve** button is **disabled** while claims remain.
2. Click **Remove** or **Confirm** on each claim:
   - *Remove* drops it.
   - *Confirm* moves it into the main content (now human-backed).
3. Once the claims box is empty, **Approve** enables. Click it.

> The block is enforced in the **database** (RLS), not just the UI - a direct
> API call to approve with claims still present returns 403.

## 4. Publish to Teams

After approving an output:

1. A **Publish to Teams** button appears on that output.
2. Click it → the formatted message posts to the configured Teams webhook and
   the button becomes **Published to Teams** (disabled).
3. The signal status becomes `published`.

> The webhook is set on `/settings/connectors`. It currently points at a
> **webhook.site test URL**, not a real Teams channel - replace it with your
> real Incoming Webhook to post to an actual channel (step 7).

## 5. The review queue

1. Go to **/review**.
2. Outputs pending review are listed, **sorted by urgency** (high → low), each
   with its audience, output type, urgency badge, and an "unverified claims"
   badge when applicable.
3. Approved/published outputs drop off the queue automatically.
4. Click any row → jumps to that signal's detail page.

## 6. AI Provider - switch to Claude by adding a key

On **/settings/connectors**, the **AI Provider** card:

1. Shows the active provider (currently `ollama`).
2. Paste a Claude API key (`sk-ant-…`) → **Save Claude key**. The card now
   shows `active: claude`. Every subsequent pipeline run uses Claude
   automatically - no restart.
3. **Remove key (use Ollama)** reverts to Ollama.

> The key is stored in Supabase Vault, never exposed to the browser. This is
> also how you'd run the real **grounding test**: switch to Claude, submit
> sample #4, and confirm the "fundamentally better AI" claim lands in
> unverified_claims.

## 7. Connectors - Teams & Gmail (outbound)

**Teams card:**
- Paste a real Teams **Incoming Webhook URL** → **Save webhook**.
- **Test connection** posts a "connection test" message to that channel.

**Gmail card (digest):**
- Enter a Gmail address, a Gmail **App Password** (not the account password),
  and recipient(s) → **Save credentials**.
- **Test connection** verifies SMTP auth without sending.
- Choose cadence (Weekly / Bi-weekly).
- **Send digest now** batches every approved-but-not-yet-sent output into one
  email and sends it. (In production this fires on a schedule, not manually.)

## 8. Connectors - Salesforce / Gong / Crayon (inbound, Test Mode)

Each inbound card runs in **Test Mode** against its fixture:

1. Click **Fetch sample signals** → it reads the fixture, creates a real
   signal, and runs it through the pipeline. The message reports how many were
   created (or deduped if the same text already exists).
2. Go to **/signals/[id]** (or `/review` once packaged) to see the result.
3. **Salesforce** specifically demonstrates config-driven field mapping - the
   adapter reads field names from `connectors.config`, never hardcoded.

> Fetch the same fixture twice and the second attempt reports it **deduped**
> (matched an existing signal by content hash) instead of re-running the
> pipeline - the cost optimization from `10-OPTIMIZATION-NOTES.md`.

---

## Quick end-to-end checklist

- [ ] Sign in
- [ ] Submit sample #1 → watch classify → interpret → package
- [ ] See classification + audience-routed outputs
- [ ] Try to approve an output with claims → blocked
- [ ] Resolve claims → approve
- [ ] Publish to Teams → status `published`
- [ ] Review queue sorted by urgency, published item gone
- [ ] Add a Claude key → provider flips to `claude`; remove it → back to `ollama`
- [ ] Fetch a sample signal from Gong/Crayon/Salesforce (Test Mode)
- [ ] (with real creds) Test Teams webhook, Gmail SMTP, send a digest
