# Compete Agent — Current Build State

*A full snapshot of everything built in the tool as it stands today. Internal reference for the team.*

**Status key:** ✅ Live/working · 🟡 Built but in test/partial · 🔲 Planned (not built)

---

## 1. What the tool is (today)

Compete Agent is a working Next.js + Supabase web app that takes a competitive signal, runs it through an AI pipeline, and produces audience-specific content for four teams — with a human review gate before anything is delivered to Microsoft Teams or email. It runs locally today (not yet deployed to production).

**End-to-end flow (as built):**
Signal in (Crayon auto-pull or manual) → Classify → Interpret → Route → Package → Verify (grounding) → PMM alerted → Human review & approval → Deliver (Teams / email).

---

## 2. Tech stack

- **Frontend:** Next.js 14 (App Router) + Tailwind CSS + TypeScript
- **Backend/DB:** Supabase (Postgres, Auth, Row-Level Security, Vault for secrets)
- **AI:** Swappable provider layer — Cloudflare Workers AI, Google Gemini, Anthropic Claude, Ollama (local)
- **Email:** Brevo (transactional API)
- **Hosting:** Runs locally today; designed for Vercel + Supabase in production

---

## 3. The AI pipeline (`lib/pipeline/`)

Six stages plus supporting logic:

| Stage | File | What it does |
|---|---|---|
| Classify | `classify.ts` | ✅ Competitor, signal type, urgency, business area, audience relevance |
| Interpret | `interpret.ts` | ✅ What happened, why it matters, **and what to do next** (source-grounded); now persisted to `signals.interpretation` |
| Route | `route.ts` | ✅ Decides which teams the signal is relevant to |
| Package | `package.ts` | ✅ Writes tailored content per audience |
| Verify | `verify.ts` | ✅ Quality gate — blocks anything not supported by the source |
| Orchestrate | `orchestrate.ts` | ✅ Runs the stages in order |
| Support | `concurrency.ts`, `retry.ts`, `litera-facts.ts` | ✅ Concurrency control, retries, Litera "assume-nothing" facts |

**Grounding guardrails (built into verify/package):** grounded-in-source, assume-nothing about Litera, one-competitor-only, audience-scope, specific-not-generic, measured tone. Unverified statements are flagged, not asserted.

---

## 4. Data sources / connectors (`lib/connectors/`)

| Connector | File | Status |
|---|---|---|
| Crayon | `crayon-connector.ts` | ✅ Live — daily auto-pull of competitive signals (currently capped at 5 for demos) |
| Gong | `gong-connector.ts` | 🟡 Built, runs against test fixtures (bulk live coverage is the next big feature) |
| Salesforce | `salesforce-connector.ts` | 🟡 Adapter shell / test mode (field mapping unconfirmed) |
| Teams (outbound) | `teams-connector.ts` | 🟡 Built — needs real channel webhook to post live |
| Gmail (outbound) | `gmail-connector.ts` | 🟡 Built — digest sending |
| Registry / Vault / Backoff / Fixtures | `registry.ts`, `vault.ts`, `backoff.ts`, `fixtures.ts` | ✅ Connector plumbing, secure credential storage, retry backoff, test data |

Crayon signals are pulled with a **manual gate** option: they can land as "pending" and be processed on demand (controls AI cost during testing).

---

## 5. AI model backends (`lib/llm/`)

Fully swappable provider layer — the model can be changed without touching the pipeline.

| Backend | File | Status |
|---|---|---|
| Cloudflare Workers AI | `cloudflare-provider.ts` | ✅ Active for testing (free tier, ~10k/day) |
| **Litera Entra (gpt-5)** | `litera-provider.ts` | ✅ **Selectable** — OpenAI-compatible via Litera's Azure/Entra gateway. ⚠️ Bearer token expires ~1h; needs a token-refresh flow for production |
| Google Gemini | `gemini-provider.ts` | ✅ Supported (no key set yet — recommended for production) |
| Anthropic Claude | `claude-provider.ts` | ✅ Supported (no key set yet) |
| Ollama (local) | `ollama-provider.ts`, `ollama-select.ts` | ✅ Local dev backend |
| Config / selection / fallback / schemas | `config.ts`, `backends.ts`, `fallback.ts`, `schemas.ts` | ✅ Backend pinning, JSON schema validation, fallback logic |

---

## 6. Delivery channels

- **Email — Brevo** (`lib/email/brevo.ts`) ✅ Live (sends approved content + review notifications). Sender: antony@onegtmlab.com. *Note: domain authentication still needed for reliable Outlook inbox delivery.*
- **Review-notification email** (`lib/email/review-notification.ts`) ✅ Emails the PMM when a signal needs review.
- **Microsoft Teams** (`teams-connector.ts`) 🟡 Built — needs the real Litera channel webhook.

---

## 7. PMM alert / notification system (`app/components/`)

Recently added — this is what makes the "PMM gets alerted" flow real:

- **Notification bell** (`NotificationBell.tsx`) ✅ — header bell with count
- **Sidebar badge** — ✅ unread count
- **Dashboard/Review banner** (`NotificationBanner.tsx`) ✅ — "You have N new signals awaiting review"
- **Notification hook** (`useNotifications.ts`) ✅ — single source of truth; polls, marks-seen (Jira/GitHub-style read behaviour), refreshes on focus
- **Signal trigger (demo)** (`/trigger`) ✅ — simulates a new Crayon signal arriving, runs the pipeline, and emails the PMM

---

## 8. App pages / screens (`app/`)

| Page | Route | Status |
|---|---|---|
| Home / landing | `/` | ✅ Compete Agent branded marketing page |
| Login | `/login` | ✅ Supabase auth + logout |
| Intake | `/intake` | ✅ Manual signal entry (chat-style composer) |
| Signals list | `/signals` | ✅ Pending + processed signals |
| Signal detail | `/signals/[id]` | ✅ Pipeline view + 4 audience outputs + review/approve/publish/email |
| Review queue | `/review` | ✅ Items awaiting approval |
| Dashboard | `/dashboard` | ✅ Overview + notification banner |
| Analytics | `/analytics` | ✅ Approval/edit metrics view |
| Connectors settings | `/settings/connectors` | ✅ Connector + AI provider config, "Fetch now" |
| Competitors settings | `/settings/competitors` | ✅ Competitor CRUD + known facts + **tier & owner selectors** (hidden from nav for demo) |
| Trigger (demo) | `/trigger` | ✅ Hidden demo alert trigger |

---

## 9. Human review & approval

- **Approval gate enforced at the database layer** (Supabase RLS) — nothing publishes without human approval.
- **Per-competitor ownership** ✅ — a competitor can have an owner; approval is scoped to the **owner, an admin, or any reviewer when the signal has no owned competitor** (so unowned/unmatched signals stay approvable). Review-notification email routes to the owner when set (else `PMM_NOTIFY_EMAIL`).
- Per-output actions (API under `/api/outputs/[id]/`): ✅ `approve`, `edit`, `reject`, `publish` (Teams), `publish-email` (Brevo), `resolve-claim` (clear a flagged claim).
- **Auto-process on open:** opening a pending signal runs the pipeline automatically (no separate button), with de-dup so it never processes twice.

**Interpretation panel** ✅ — the signal page shows **What changed → Why it matters → What to do next**; the *what-to-do-next* recommendation is reviewer-editable (`/api/signals/[id]/interpretation`) and not required for approval.

**Source links** ✅ — Crayon footnote links are preserved and shown as a "Sources" list under each signal (the pipeline still receives clean text).

---

## 10. Audience outputs

Per-audience content, tailored by `lib/audience.ts` labels:
- **Sales & Customer Success** — talk tracks, objection handling
- **Product Management** — feature details, roadmap watch-outs
- **Marketing / Integrated PMM** — messaging pivots, campaign angles
- **Executive Leadership** — strategic summaries, business impact

One signal → tailored content for each relevant team (routing decides which).

---

## 11. Database (Supabase / Postgres)

Tables (`supabase/migrations/`, through `0012`):
- `signals` — raw signals; now also `source_links` (Crayon citations) + `interpretation` jsonb (what changed / why it matters / what to do next)
- `signal_classification` — classify-stage output
- `signal_outputs` — generated per-audience content + approval status + published_at
- `competitors` — competitor records + known facts; now also `tier` (1/2/3) + `owner_id`
- `artifacts` + `artifact_signals` — **new, schema only** — many-to-one structure for future multi-signal digests; nothing writes to them yet
- `connectors` — connector config + mode (test/live) + secrets (Vault)
- `llm_config` — selected AI backend + settings
- `user_profiles` — users + roles (submitter/reviewer/admin) for RLS

---

## 12. What's live vs. test vs. planned

**✅ Live / working today**
- Crayon auto-pull · full pipeline · grounding guardrails · 4 audience outputs · human review gate · email delivery (Brevo) · PMM alert system · login/logout · dashboard/analytics · swappable AI backend (Cloudflare test tier + Litera gpt-5)
- **Interim build (migrations 0008–0012):** Crayon source links · competitor tiers · per-competitor ownership + owner-scoped approval RLS · "what to do next" recommendation · artifacts groundwork (schema only)

**🟡 Built but test/partial**
- Gong (fixtures only) · Salesforce (shell) · Teams posting (needs webhook) · Gmail digest · Cloudflare on free tier · competitor tiers/owners exist but **no tier-driven behaviour yet** (data only)

**🔲 Planned (not built yet)**
- Full Gong coverage across all competitors *(top priority)*
- Cross-signal synthesis (patterns over time)
- Competitor memory (loading battlecards/positioning)
- Litera's messaging built in (four pillars, RoAI, GrowthTech)
- Smart deduplication across sources + custom filtering
- Tier-driven routing/urgency + owner-scoped review queue
- Digest generation (the artifacts tables exist, unused)
- Feeding insights back into Crayon
- Production deployment + multi-pod self-service

---

## 13. Known limitations / dependencies to go live

- **Production AI model** — currently on Cloudflare free tier (~10k/day); needs a paid, scalable model (Gemini recommended) for 100+ competitors × ~100 signals/day.
- **Email deliverability** — needs domain authentication (SPF/DKIM/DMARC) for reliable Outlook inbox delivery.
- **Teams delivery** — needs the real Litera channel webhook(s).
- **Gong access** — needs bulk transcript API access for the priority feature.
- **Not yet deployed** — runs locally; needs Vercel + Supabase production for PMM use.
- **Messaging & competitor content** — needs Litera's frameworks, competitor watchlist, and battlecards to make outputs on-brand.

---

*This document reflects the build as of today and will be updated as features land.*
