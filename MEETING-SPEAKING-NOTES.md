# Speaking Notes: Client Meeting

*For your own reference on the call. Plain English, short lines, in a natural talking order.*

---

## 1. Quick recap: what we've already built (the current tool)

Say: "Before we get into the new PRD, quick recap of what's live today."

- **The core engine.** One competitive signal goes in, it's automatically classified, interpreted, and turned into content for four teams. Takes minutes instead of hours.
- **Four audience outputs.** Every signal produces tailored content for Sales, Product, Marketing, and Leadership, each written in the right voice for that team.
- **Human review and approval.** Nothing goes out automatically. A reviewer reads, edits, and approves everything first, and this is enforced at the database level, not just hidden in the UI.
- **Grounding and accuracy.** The tool only states what the source actually supports. Anything it can't verify is flagged, and any inference about a competitor is worded as a guess, not stated as fact.
- **"What changed, why it matters, what to do next."** Every signal now shows this breakdown, and the recommendation is editable by a reviewer.
- **Source traceability.** Each signal shows links back to the original Crayon items it came from, so a reviewer can check the source in one click.
- **Live Crayon connection.** Signals pull in automatically from Crayon, no copy-paste.
- **Competitor tiers and ownership.** Competitors can be tiered (Primary, Secondary, Watching) and assigned an owner, who gets notified and is the one who approves that competitor's content.
- **Alerts.** A notification system tells the reviewer when something new needs attention.
- **Delivery.** Approved content goes out to Microsoft Teams or email.
- **Running on Litera's own GPT-5.** The AI model is swappable, and it's currently connected to Litera's own hosted GPT-5, so quality is strong and nothing goes to an outside model.
- **It's live and explorable.** There's a deployed link and a demo login, so anyone can click through it today.

---

## 2. What we found on the Crayon API (for the new PM tool PRD)

Say: "Before scoping the new PRD, we went and tested Crayon's API directly, live."

- **The good news.** Crayon has an endpoint called Insights that returns real, individual competitor updates with a timestamp, a type, the competitor, and a source link, basically everything the PRD assumes exists.
- **The catch.** When we called it with Litera's actual credentials, it came back "not enabled for this account." It's not broken, it's just switched off at the account level, likely a plan or licensing setting.
- **What already works today.** Crayon's weekly AI-written summaries, battlecards, and the "ask a question" feature. We tested the ask feature live and confirmed it gives a real answer with source links.
- **The ask:** we'd like Litera to request that Crayon turn that Insights feature on. It's a simple toggle on their side, and it's the single most useful thing that could happen before we start building.

---

## 3. The two paths we've planned for, either way

Say: "So we've planned Phase One to work either way, so we're not stuck waiting."

- **Approach A, if Crayon turns it on.** We build on real data. Accurate dates, real categories, precise tracking of what's new. This is the best version and less work for us.
- **Approach B, if it's not turned on in time.** We build on the summaries we already use today, and we work out the categories ourselves. Still fully workable, just slightly less precise on the 30-day window.
- Either way, the ask box works today already, since it doesn't depend on this.

---

## 4. What the client actually asked for (the new PRD, in plain terms)

Say: "Quick walk-through of what's actually in their PRD, in plain terms."

- **A per-competitor feed with unread counts.** A simple list of competitors on the left, each showing how many new updates are waiting.
- **Limited to the last 30 days.** Not everything Crayon tracks, just recent product-relevant activity, so it stays quick to scan.
- **A filter by type.** Release, pricing, API, docs, so a PM can narrow down to just what they care about.
- **A "why it matters for us" note.** The core idea: each update gets one or two sentences explaining what it means for Litera specifically, grounded in Litera's own roadmap and strategy docs, not a generic take.
- **An ask box.** A PM can type a question in plain English and get an answer that reaches further back than 30 days, with sources.
- **No approval step.** Unlike our current tool, this one shows updates directly to PMs, no reviewer sign-off in between, as they confirmed.
- **Doesn't replace the current tool.** This is a separate, focused view for the Product team. The four-audience tool we already built stays as is.

---

## 5. What we're actually going to build (the new, net-new work)

Say: "Here's what's genuinely new, separate from anything that exists today."

- **The context library.** This is the big one. A place to upload Litera's roadmap, GTM strategy, positioning, and the Growth Story, and a way for the tool to actually read and reference those documents when writing a note. This is the part that makes the note trustworthy instead of generic.
- **The pull interface.** The competitor list, the feed, the filters, all new screens we haven't built yet.
- **The ask box interface.** Connecting the working Crayon feature into an actual screen PMs can use.

---

## 6. What we still need from them before we can commit to dates

Say: "A short list of what we're waiting on."

- Their decision on asking Crayon to enable the Insights feature.
- The initial list of competitors for this tool.
- The context documents: roadmap, GTM strategy, positioning, and the Growth Story.
- Confirmation on data handling, once their side has reviewed it.

---

## 7. How to close the meeting

- Reconfirm: this runs alongside the current tool, doesn't replace it.
- Reconfirm: no approval step for this one, notes go straight to PMs.
- Ask directly: can they raise the Crayon request this week?
- Ask directly: when can we expect the competitor list and the documents?
- Close with: once those land, we'll come back with a firm, dated plan.
