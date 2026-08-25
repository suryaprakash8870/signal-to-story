# Compete Agent — Explore Guide & Version Overview

**Prepared for:** Litera CI / Product Marketing Team
**Prepared by:** OneGTM Lab (Antony & Ajay)
**Purpose:** A guide to explore the live version of Compete Agent, a summary of everything built so far, the current limitations to be aware of, and what we need from Litera to reach full production quality.

---

## 1. What is Compete Agent?

Compete Agent is an AI-powered competitive intelligence layer that turns a single competitive signal into ready-to-use content for four teams — **Executive Leadership, Product, Marketing, and Sales & Customer Success** — with a human review step before anything is shared.

It sits **on top of the tools you already use** (Crayon today, Gong next); it does not replace them. It automates the slow, manual work *between* capturing a signal and delivering audience-ready content.

**In one line:** One competitive signal in → tailored, human-approved content out for every team, in minutes.

---

## 2. How to access and explore

**Live link:** `[ your deployed link here ]`

**Demo login (already set up for you):**
- **Email:** `demo@compete-agent.com`
- **Password:** `demo123`

These credentials are also shown on the login screen. On the home page, clicking **"Try now"** takes you straight to a login with the demo details already filled in — just click **Sign in**.

### A suggested 5-minute walkthrough

1. **Home page** — see the Compete Agent overview and the sources it builds on (Crayon, Gong).
2. **Sign in** with the demo account (or click "Try now").
3. **Signals** (left menu) — click **"Fetch from Crayon"** to pull the latest live competitive signals. They appear as **pending**.
4. **Open a pending signal** — the AI pipeline runs automatically (classify → interpret → route → package → verify). You'll see it work, then reveal the results.
5. **Read the interpretation panel** — *What changed → Why it matters → What to do next* (the recommendation is editable by a reviewer).
6. **Review the four audience outputs** — each team gets tailored content. **Approve** one, then **Send via Email** to see delivery.
7. **Settings → Competitors** — see how competitors can be given a **Tier** (Primary / Secondary / Watching) and an **Owner** (who is notified and who approves).
8. **Settings → Connectors** — see the connected sources (Crayon live) and the AI provider settings.
9. **Dashboard / Analytics** — the overview, alerts, and approval metrics.

---

## 3. The end-to-end flow (what happens behind the scenes)

**Signal in → Classify → Interpret → Route → Package → Verify → Human review → Deliver**

1. **Signal in** — pulled automatically from Crayon (or entered manually).
2. **Classify** — identifies the competitor, signal type, urgency, and business area.
3. **Interpret** — explains what happened, why it matters, and what to do next — grounded only in the source.
4. **Route** — decides which teams the signal is relevant to.
5. **Package** — writes tailored content for each relevant team.
6. **Verify** — checks the output against the source; anything unsupported is flagged, not asserted.
7. **Human review** — a reviewer reads, edits, approves or rejects. Nothing is published automatically.
8. **Deliver** — approved content goes to Microsoft Teams or email.

---

## 4. What this version includes

**Core engine**
- Automated daily signal pull from **Crayon**, plus on-demand **"Fetch from Crayon"**.
- Full AI pipeline with **accuracy guardrails** — content is grounded in the source, and inferences about a competitor are marked as inference ("may", "suggests"), never stated as fact.
- **Four audience outputs** per signal (Leadership, Product, Marketing, Sales/CS), each in the right voice.

**Interpretation & traceability**
- Each signal shows **What changed → Why it matters → What to do next**, with the recommendation editable by a reviewer.
- **Source links** — the underlying Crayon citations are preserved so a reviewer can open the original in one click.

**Review, ownership & delivery**
- **Human review & approval gate** — enforced at the database level; nothing is shared without approval.
- **Per-competitor ownership** — a competitor can have an owner, who is notified and is the one who approves that competitor's content.
- **Competitor tiers** — Primary / Secondary / Watching (currently informational).
- **Delivery** to Microsoft Teams and email.

**Alerts & workspace**
- A **PMM alert system** — a notification bell, badge, and banner when new signals await review.
- A clean dashboard, analytics view, and a simple, branded interface.

**Flexible AI**
- The AI model is **swappable**. This version can run on **Litera's own GPT-5 gateway** for the highest quality, with a cost-friendly fallback model available for routine testing.

---

## 5. Current limitations (please read)

We want to be transparent about what is and isn't production-ready in this version.

**1. The GPT-5 access token expires roughly every hour.**
The tool currently connects to Litera's GPT-5 through an access token that Litera's system issues for about **one hour at a time**. While exploring, if outputs suddenly stop generating (an "authentication expired" message), the token simply needs refreshing — there is a field in **Settings → Connectors → Litera access token** to paste a fresh one. For a permanently-on production deployment, this needs a proper automatic token-refresh setup (a standard configuration on Litera's side), which we would put in place before go-live.

**2. GPT-5 is high quality but slower.**
Because GPT-5 is a reasoning model, a single signal takes around **3 minutes** to fully process. This is normal, and worth it for the quality; a faster model is available if speed matters more than depth during testing.

**3. Email delivery to some inboxes may land in Junk.**
Until the sending domain is fully authenticated, emails (especially to Microsoft Outlook) can be filtered to Junk. This is a one-time DNS setup we would complete for production.

**4. This is a demo environment with sample data.**
The competitor list and signals shown are for exploration. Your real competitors, tiers, owners, and messaging are not yet loaded (see next section).

---

## 6. What we need from Litera for the best output

The tool is working well on the *structure* of the intelligence. To make the *content* fully on-brand and accurate to Litera, we need a few inputs from you:

**1. Litera's messaging frameworks** *(the single biggest quality lever)*
- The **four pillars**
- The **RoAI (Return on AI) positioning**
- The **GrowthTech story**

Today the tool deliberately does **not** claim anything about Litera it hasn't been told — so, for example, a sales talk track is built around smart discovery questions rather than Litera's strengths. Once we load your messaging, the outputs will speak in Litera's voice and lead with your real differentiators.

**2. Your competitor list and tiers** — the competitors you track, ideally grouped into your Primary / Secondary / Watching tiers.

**3. Battlecards and positioning documents** — so the AI has persistent context on each competitor (its strengths, weaknesses, and how you position against it).

**4. Gong access** — API access to your Gong call transcripts, so the tool can scan **all** competitor mentions (not just the limited set Crayon covers) — the highest-value next feature.

**5. Delivery details** — the Microsoft Teams channels and email recipients each team's content should go to.

**6. A data-handling note** — confirmation of how competitor and customer-adjacent data may be processed, before any live connection to sensitive sources.

---

## 7. What's next

Based on your feedback so far, the priorities after this version are:
- Load Litera's messaging so outputs are fully on-brand.
- **Full Gong coverage** across all competitors, feeding insights back into Crayon.
- Cross-signal synthesis (spotting patterns across many signals over time).
- Tier-driven prioritisation and per-team delivery cadence.

---

## 8. In summary

This version demonstrates the complete core loop — **from a live competitive signal to grounded, human-approved, audience-ready content** — running on Litera's own GPT-5. It is ready for you to explore end-to-end using the demo login above.

The two things that will take it from "impressive demo" to "daily production tool" are **your messaging frameworks** (for on-brand output) and a **stable AI connection** (the token-refresh setup) — both straightforward, and both on our near-term plan.

We would love your feedback as you explore. Please note anything that feels off, missing, or particularly useful — it directly shapes what we build next.
