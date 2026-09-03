# Compete Agent - Product Overview & Our Understanding

**Prepared for:** Litera CI / Product Marketing Team
**Prepared by:** OneGTM Lab (Antony & Ajay)
**Purpose of this document:** To confirm, in plain language, how the Compete Agent tool works end-to-end, what each team receives, what it does today, what we plan to build next, and our full understanding of the requirement based on everything shared so far.

---

## 1. What is Compete Agent?

Compete Agent is an AI-powered competitive intelligence layer that sits **on top of the tools you already use** (like Crayon and Gong). It does not replace them.

It takes one raw competitive signal - a competitor move, a sales-call mention, a market update - and automatically turns it into **ready-to-use content for each team**, with a human approving everything before it goes out.

**In one line:** One competitive signal in → tailored, approved content out for every team, in minutes instead of hours.

---

## 2. The problem we are solving

The problem was never *collecting* competitive information - you already have plenty of it in Crayon, Gong, and elsewhere. The problem is the **manual work after the signal arrives**:

- Someone (usually a PMM) has to read it, understand it, decide who needs to know, and then rewrite the same information several different ways - for Leadership, Product, Marketing, and Sales/CS.
- This takes hours or days, and by the time it's done, the moment has often passed.

Compete Agent automates that middle layer, so the response is fast, consistent, and always human-approved.

---

## 3. How it works - the end-to-end flow

**Signal → Classify → Interpret → Route → Package → Verify → Human Review → Deliver**
*In short: Signal → Understanding → Story → Action.*

Here is the complete journey of a single signal, step by step:

**Step 1 - A signal is detected**
A new competitive signal arrives automatically from a connected source (e.g. Crayon pulls in daily), or it can be entered manually. The PMM is alerted - an email notification is sent, and an alert appears inside the app (a bell, a badge, and a banner).

**Step 2 - Classify**
The AI identifies what the signal is about: which competitor, what type of signal, how urgent it is, and which business area it touches.

**Step 3 - Interpret**
The AI explains *what actually happened* and *why it matters* - based only on the information in the signal, never guesswork.

**Step 4 - Route**
The system decides which teams should care about this signal. Not every signal goes to every team - only the relevant ones.

**Step 5 - Package**
The AI writes tailored content for each relevant team (see the personas in Section 4).

**Step 6 - Verify (accuracy check)**
Before anything moves forward, the system checks its own output against the original source. The core rule: *if the source does not support a claim, the tool does not make that claim.* Anything uncertain is flagged, not presented as fact.

**Step 7 - Human review & approval**
Nothing is published automatically. A reviewer can read, edit, approve, or reject each output. People stay in control; the AI just does the heavy lifting.

**Step 8 - Deliver**
Once approved, the content is sent to where teams already work - **Microsoft Teams and email** - so no one has to log into a new tool to get value.

**Step 9 - The loop continues**
Each new signal follows the same path, and over time the tool builds a running record of competitor activity that teams can look back on.

**Access - where it lives:** Compete Agent is a simple web app the PMM logs into. But teams don't have to go looking for it - the insights come to them. The PMM is alerted by email and inside the app when a new signal needs review, and approved content is delivered straight into Microsoft Teams and email. So each person's journey starts right where they already work.

---

## 4. Who the tool serves - the personas and what each one needs

One signal is packaged differently for each audience, because each persona cares about different things. Here is the specific information each one needs:

### Executive Leadership Team (ELT)
- **They care about:** strategy and business impact - should we react, and how does this affect our position?
- **What they receive:** a short, high-level strategic summary - what the competitor did, why it matters to the business, and the strategic consideration.
- **Format:** brief and decision-focused (a few lines they can read in seconds).

### Product Management (PM)
- **They care about:** roadmap implications - does this competitor move change what we should build or prioritise?
- **What they receive:** the relevant feature details, how it compares to our product, and clear roadmap watch-outs.
- **Format:** specific and practical, focused on product decisions.

### Marketing (Integrated PMM)
- **They care about:** messaging and campaigns - how do we position against this, and is there a campaign opportunity?
- **What they receive:** messaging pivots, differentiation points, and campaign or positioning angles.
- **Format:** ready-to-use messaging ideas.

### Sales & Customer Success (Sales/CS)
- **They care about:** winning the live conversation - what do I say on the next prospect or customer call?
- **What they receive:** talk tracks, objection-handling guidance, and the competitor's real weaknesses to lead with.
- **Format:** short, conversational, call-ready snippets.

**In short: one signal becomes four audience-ready outputs - automatically, each with the exact information that persona needs.**

---

## 5. What works today (current capabilities)

- ✅ Automated daily signal pull from **Crayon**
- ✅ Full AI pipeline: Classify → Interpret → Route → Package → Verify
- ✅ Tailored content for all four teams
- ✅ Accuracy guardrails (grounded in the source, no invented facts)
- ✅ **PMM alert system** - email + in-app bell/badge/banner when a new signal needs review
- ✅ **Human review & approval** gate before anything is shared
- ✅ Delivery to **Microsoft Teams and email**
- ✅ Login and a clean, simple interface

**Your data stays protected:** signals are processed privately, nothing is ever published without human approval, and access to sensitive sources (like Gong) follows a data-handling policy agreed with Litera.

---

## 6. What we plan to build next

Your feedback made clear that the biggest value is in **filling Crayon's gaps and feeding intelligence back into it** - not rebuilding what Crayon already does. Based on that, here is what we plan to add:

1. **Full Gong coverage** - scan *all* Gong call transcripts for *any* competitor mention (not just the 10 Crayon Pro competitors), and surface structured insights that can be fed back into Crayon. *(This is the highest-value gap.)*
2. **Cross-signal synthesis** - spot patterns across many signals over time (e.g. *"Harvey came up in 7 deals this month, mostly on contract review"*), not just one signal at a time.
3. **Competitor memory** - give the AI persistent context on each competitor (battlecards, positioning, prior signals, known strengths/weaknesses) so it works *with* your existing assets.
4. **Your messaging built in** - load Litera's brand voice and new messaging (the four pillars, the RoAI positioning, the GrowthTech story) so every output sounds like Litera.
5. **Smart deduplication & filtering** - recognise the same event across Crayon and Gong, and let you choose which competitors and signal types enter the queue.
6. **Self-service for each PMM pod** - so every product marketing team can use it within their own workflow.
7. **Scale** - reliably handle 100+ competitors and up to ~100 signals per day.

---

## 7. Our full understanding of the tool (based on information shared to date)

*(Working summary - to be refined together.)*

Based on everything shared so far, this is how we understand the overall goal and shape of the tool:

- **The core need:** Litera needs to respond to competitors much faster. Leadership feels the current response is too slow, so the tool must turn competitive signals into action within minutes, not days.
- **A layer on top, not a replacement:** the tool builds on Crayon and Gong as inputs and feeds intelligence back into Crayon as the system of record - it does not try to replace them.
- **Self-sufficient for every PMM pod:** each product marketing team should be able to use it inside their own workflow, without depending on a central bottleneck.
- **Persona-first packaging:** the value is in automatically translating one signal into the right message for ELT, PM, Marketing, and Sales/CS - each in their own language and level of detail.
- **On-brand and trustworthy:** outputs must use Litera's own messaging (four pillars, RoAI, GrowthTech story), stay grounded in the source, and always pass a human review before going out.
- **Delivered where people work:** insights should arrive in Microsoft Teams and email, so teams don't have to learn a new tool.
- **The priority gap:** the highest-value addition is full Gong transcript coverage across all competitors - beyond Crayon's Pro-10 limit - which expands competitive range without extra licenses.
- **Real-world example that matters now:** applying this to a live competitor scenario (e.g. an Intapp / Celeste move) and packaging it for every persona using the new GrowthTech messaging - a stated CEO priority.

We will keep refining this section with you as more detail is shared.

---

*This document reflects our current understanding of the tool and how we believe it should work. To confirm the specifics - messaging, competitor priorities, delivery preferences, and workflow - we will follow up with a short questionnaire.*
