# Compete Agent - PM Tool: Phase One Plan

**Prepared for:** Litera Product & Competitive Intelligence Team
**Prepared by:** OneGTM Lab (Antony & Ajay)

---

Thank you for the PRD - it's clear, well-scoped, and a strong direction for Phase One. A meaningful part of the engine it describes already exists on our side, which gives us a solid starting point.

Before finalising the plan, we carried out a live technical review of the Crayon API, since several parts of the PRD depend on exactly what it can provide. This document shares what we found, the one request we'd like to make of Crayon on your behalf, two clear paths forward depending on the outcome, and the full scope, approach, and indicative timeline for Phase One.

---

## 1. What we found on the Crayon API

We reviewed Crayon's current API documentation in detail and tested it directly against Litera's live credentials, so this reflects what the account can actually do today - not an assumption.

### A capability that closely matches the PRD

Crayon's API includes an **Insights** endpoint that returns raw, individual competitor updates rather than AI-written summaries. Based on Crayon's own documentation, each item includes:

| What the PRD needs | Available on this endpoint |
|---|---|
| A timestamp for each update | ✅ Yes |
| A type or category (release, pricing, etc.) | ✅ Yes |
| The competitor it relates to | ✅ Yes |
| A link back to the original source | ✅ Yes |
| The ability to fetch only what's new since the last check | ✅ Yes |
| Filtering to a specific date range (for the 30-day window) | ✅ Yes |

In short, this endpoint appears to offer nearly everything the PRD assumes is available.

### It is not currently switched on for Litera's account

When we called this endpoint using Litera's credentials, it returned a **"feature not enabled for this account"** response. This is not a limitation of the credentials themselves - the same credentials work correctly on every other endpoint we tested - it is a feature that Crayon enables at the account level, most likely tied to plan or licensing.

### What we confirmed is working today

- Crayon's **weekly AI-written competitor briefings** (the source we already use).
- Crayon's **battlecard content**.
- Crayon's **"Ask a question" endpoint** - we tested this live and confirmed it returns a written answer together with source links, exactly as the PRD's ask box describes.

---

## 2. Our request

**We'd like to ask that Litera's Crayon account representative enable the Insights API feature on the account.**

This appears to be a straightforward account-level toggle rather than a new integration, and it is the single most valuable step available to us before Phase One begins - it determines how closely we can build to the original PRD. We're glad to join a short call with your Crayon contact if that would help move it along.

---

## 3. Two paths forward

To avoid losing time while that request is with Crayon, we've planned Phase One so it can proceed either way, and would upgrade automatically the moment the feature is enabled - no rebuild required.

### Approach A - if Crayon enables the Insights API

We build directly on real, individual competitor updates: accurate timestamps, genuine type tags supplied by Crayon, a precise 30-day window, and reliable detection of what's new. This is the closest possible match to the PRD as written, and the most efficient path.

### Approach B - if it is not enabled in time

We build on Crayon's existing weekly briefings. Since these don't carry a type tag for each item, we classify updates ourselves (Crayon's own briefings already use consistent categories - launch, pricing, win, expansion, risk - which gives us a strong starting signal). The 30-day window becomes approximate rather than exact, based on when each briefing was generated. The ask box is unaffected either way, since it already runs on Crayon's own question-answering capability, which we've confirmed works well today.

**Either approach delivers a working, valuable Phase One.** Approach A is simply more precise and requires less custom work on our side.

---

## 4. Phase One scope

| Feature | In Phase One | Notes |
|---|---|---|
| Per-competitor feed with unread counts | ✅ | Same experience under either approach |
| Rolling 30-day window | ✅ | Exact under Approach A, approximate under Approach B |
| Product-signal filter (Release / Pricing / API / Docs) | ✅ | Real categories under Approach A, derived categories under Approach B |
| Context library (roadmaps, GTM strategy, positioning, narrative) | ✅ | New capability - see Section 6 |
| "Why it matters for us" note, grounded in your own context | ✅ | The core value of the tool; where we'll focus the most attention |
| Ask box, searching full history, with source links | ✅ | Already confirmed working |
| No approval step - notes shown directly to PMs | ✅ | As confirmed |
| Runs alongside the existing four-audience tool | ✅ | Does not replace it, as confirmed |
| Initial competitor set | ⏳ | Awaiting your list |
| Push notifications / digest | Not in Phase One | Planned for a later phase, per the PRD |

---

## 5. What we'd still need from you

1. **The outcome of the Crayon Insights API request** (Section 2).
2. **The initial list of competitors** for Phase One, as mentioned.
3. **The context documents** - the company narrative, the Growth Story, the roadmap, and the GTM strategy document - company-wide in scope, with the PMM team keeping them current, as confirmed.
4. **Confirmation on data handling**, once your review is complete. For context, the documents would be processed through Litera's own GPT-5 environment rather than an external model, which we understand aligns with what you're comfortable proceeding on in the meantime.

---

## 6. How we'll build it

**What we're able to reuse from the current version:**
- The Crayon connection already in place.
- The competitor data model.
- The AI model connection (Litera's own GPT-5 environment).
- The "seen / unread" mechanism already built for signal alerts.
- Our existing approach to accuracy - stating only what a source supports, and clearly softening anything that's an inference rather than a fact. This is exactly the behaviour the PRD asks for in the relevance note.

**What is new for this tool:**

**The context library** - the heart of the tool. This means building the ability to upload roadmaps, GTM strategy, positioning, and the company narrative; storing them; and building a retrieval layer so that when a competitor update comes in, the system pulls the specific, relevant section of your own documents to ground the note against - never inventing a connection where none exists, and naming which document it drew on so a PM can trust it at a glance.

**The pull interface** - the competitor list with unread counts, the per-competitor feed with filters, and the relevance note shown against each update.

**The ask box** - a simple question interface connected to Crayon's existing question-answering capability, with answers and source links shown in-product.

---

## 7. Indicative timeline

This is a working outline to guide our conversation. We'll return with firm, dated milestones once the items in Section 5 are confirmed - particularly the outcome of the Crayon request, which meaningfully affects the shape of the build.

| Phase | Focus |
|---|---|
| 1 | Confirm Crayon outcome, receive competitor list and context documents, finalise the technical approach |
| 2 | Build the context library and begin generating relevance notes against your real documents |
| 3 | Build the pull interface - feed, filters, unread counts - and connect the ask box |
| 4 | Test end-to-end with real competitors and real context, refine note quality, and prepare for rollout |

---

## 8. A few things worth flagging

- **Note quality is what will drive adoption.** The PRD's own success measure is repeat weekly use, not just coverage, so we plan to review note quality closely before this reaches the full PM team.
- **Keeping context current matters.** Since stale context is the main risk to trust, we'll include a simple "last updated" indicator on each document so freshness is always visible.
- We'll proceed on data handling as outlined in Section 5, and adjust promptly if your review points us in a different direction.

---

## 9. Next steps

1. Raise the Insights API request with Crayon.
2. Share the initial competitor list and context documents.
3. We return with a confirmed, dated Phase One plan, and are happy to walk through any of this on the call.

Thank you again for the clarity of the PRD - we're looking forward to building this with you.
