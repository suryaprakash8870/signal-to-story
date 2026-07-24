# Compete Agent — What We Need to Go Live (Production Requirements)

**Prepared by:** OneGTM Lab (Antony & Ajay)
**Purpose:** This document lists what we need to move Compete Agent from a working demo to a **production-ready tool running on real Litera data**, used by PMM pods day to day. Each item notes what is needed, who provides it, and why it matters.

*Note: All keys and secrets are stored securely, never exposed in code or shared publicly. Any credentials shared during setup should be rotated after handover as standard practice.*

---

## 1. Data sources — to run on real data

**Crayon (competitive signals)**
- **Status:** We currently hold a Crayon API key and can pull signals. ✅
- **Blocker:** We are facing an **access issue on the Litera side** while setting up the wider integration (see Section 6 — account/mailbox access). This needs to be resolved to complete and verify full access.
- **Needed:** Confirmation of the correct Crayon access level, and (if desired) permission to **write insights back into Crayon** as the system of record.

**Gong (call transcripts) — HIGH PRIORITY**
- **Needed:** API access to **all** Gong call transcripts, so the tool can scan every call for any competitor mention — not just the 10 Crayon Pro competitors.
- **Who provides:** Litera (confirm Gong plan / API tier).
- **Why it matters:** This is the single highest-value capability requested; it expands competitive coverage without extra Crayon licenses.

**Salesforce (optional, if in scope)**
- **Needed:** API access and field mapping, if CRM signals are to be included.
- **Who provides:** Litera (confirm object/field names).

---

## 2. Production AI model — the biggest requirement

- **Needed:** A reliable, cost-friendly production AI model API. Our demo currently runs on a free testing tier that will not sustain real volume (100+ competitors, up to ~100 signals/day), and added features (competitor memory, brand messaging) increase AI usage.
- **Recommendation:** **Google Gemini** — strong quality at a friendly cost. (Anthropic Claude is an option for higher quality at higher cost.)
- **Who provides:** We set it up; we need budget approval / a paid API key.
- **Why it matters:** This is our single biggest limitation today, and is essential for going live at scale.

---

## 3. Hosting & deployment — to make it usable

- **Needed:** Deploy the app to a **live, secure URL** (recommended: Vercel for the app + Supabase for the database in production) so PMMs can log in and use it. Today it runs locally on our machines.
- **Who provides:** We set it up; may require a hosting account / budget approval.
- **Why it matters:** Required before any PMM pod can use the tool in their real workflow.

---

## 4. Delivery channels — to reach the teams

**Microsoft Teams**
- **Needed:** The specific Teams channel webhook URLs where approved content should be posted, per team.
- **Who provides:** Litera.

**Email deliverability**
- **Needed:** Domain email authentication (SPF, DKIM, DMARC DNS records) on the sending domain, so emails reliably reach the inbox — especially Microsoft Outlook, which currently filters new senders to Junk.
- **Who provides:** Whoever manages the sending domain's DNS (Litera IT / domain owner).
- **Why it matters:** Without this, delivery to Outlook is unreliable (lands in spam or is dropped).

---

## 5. Litera content & configuration — to make outputs real and on-brand

- **Messaging assets:** the four pillars, RoAI positioning, and the GrowthTech story — to build Litera's brand voice into every output.
- **Competitor watchlist:** the list of competitors to track, ideally tiered by priority.
- **Battlecard content:** existing positioning/battlecards, to give the AI competitor memory.
- **Recipients & reviewers:** who receives each team's content, and who approves before it goes out.
- **Who provides:** Litera.

---

## 6. Account & system access — current blocker

To integrate with Litera's internal systems (e.g. Confluence) and complete setup, we need a **properly provisioned Litera account**.

- **Current issue:** When attempting to log in to Confluence using `Antony.Raj@lmscloudlab.com`, a verification OTP is sent to that email — but the mailbox cannot be accessed. Outlook returns:
  > *"OwaUserHasNoMailboxAndNoLicenseAssignedException"*
- **Meaning:** the account has **no active mailbox and no license assigned**, so we cannot receive the OTP required to complete login.
- **Needed:** Litera to enable an **active mailbox and the required license** for this account (or provide an alternative way to receive the verification code and access the relevant systems).
- **Why it matters:** Without access, we are blocked from completing Confluence-based setup and verifying full system integration.

---

## 7. Security & data handling

- All API keys and secrets are stored server-side only and never exposed in the app or code repository.
- Access to customer-adjacent data (Gong / Salesforce) will follow a data-handling policy agreed with Litera **before** any live connection sends real data to the AI provider.

---

## 8. Summary — what we need to go live

1. **Production AI model key (Gemini + budget)** — *biggest priority*
2. **Gong API access (bulk, all competitors)** — *from Litera*
3. **Crayon:** confirm full access + optional write-back (key already in hand; resolve access blocker below)
4. **Production hosting / deployment** — *we set up*
5. **Microsoft Teams channel webhooks** — *from Litera*
6. **Email domain authentication (DNS)** — *from Litera IT*
7. **Litera messaging, competitor list & battlecards** — *from Litera*
8. **Account access fix** — active mailbox + license for the Litera account (Confluence OTP blocker)

Please review and let us know what you can provide and what needs discussion, so we can finalise the plan and timeline to go live.
