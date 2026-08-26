# Compete Agent PM Tool: Phase One Status Report

Internal report. Verified against the running application and live data, not from memory.

---

## 1. Where we are

Every feature in the PRD's "In" list is built, tested against live Crayon data, and grounded in Litera's real strategy documents. The application builds cleanly and is ready to deploy.

Two things are outstanding, both waiting on Litera rather than on us: the Crayon Insights API decision, and the initial competitor list.

---

## 2. PRD checklist

Against the "In" scope defined in the client's PRD.

| PRD requirement | Status | How it works |
|---|---|---|
| Per-competitor feed | Done | Left rail lists 12 competitors; selecting one shows their updates, newest first |
| Unread counts | Done | Each competitor shows a count of updates not yet viewed; opening the competitor clears it |
| Rolling 30-day window | Done | All 97 stored updates fall inside the window; older items are excluded from the feed |
| Product-signal filter | Done | Filter chips for Release, Pricing, Customer win, Expansion, Risk. Type is derived from Crayon's own category emoji |
| Context library | Done | All 5 Litera documents uploaded, split into 76 sections. Upload replaces a document in place and shows a last-updated date |
| "Why it matters for us" note | Done | Written per update, grounded in the context library, naming the document and section it drew on |
| Note stays general when nothing applies | Done | Verified: never invents a connection. This is enforced, not incidental |
| Ask box across full history | Done | Queries Crayon's Answers endpoint directly, so it reaches beyond the 30-day window, and returns source links |
| Source link per update | Done | 91 of 97 updates carry a link back to the underlying Crayon insight |
| No approval gate | Done | PMs see updates and notes directly, as confirmed with the client |
| Runs alongside the four-audience tool | Done | Verified unaffected: 15 signals, 6 outputs across all four audiences, untouched |
| Push notifications / digest | Not in scope | Correctly excluded per the PRD |

---

## 3. Phase One plan checklist

Against the plan we sent the client.

| Commitment | Status |
|---|---|
| Investigate what the Crayon API actually exposes | Done. Findings sent to the client |
| Request the Insights API be enabled | Done. Client has raised it with Crayon; awaiting their response |
| Build so either path works | Done. Running on Path B; Path A would swap the data source without rebuilding the feed, filters, or notes |
| Receive and load the context documents | Done. All 5 received and loaded |
| Build the context library | Done |
| Build the pull interface | Done |
| Build the ask box | Done |
| Confirm data handling | Client proceeding as-is pending their review. We run on Litera's own models, so no third party sees their documents |
| Initial competitor list | Outstanding. The feed currently uses whichever competitors Crayon returns |

---

## 4. How each piece works, briefly

**Getting the updates in.** Crayon publishes briefings ("Sparks"), each bundling roughly five separate competitor updates. We pull those, split them into individual items, work out the type from Crayon's own category markers, and keep each item's source link. Re-running only adds genuinely new items.

**The context library.** Litera's roadmap, GTM strategy, positioning, narrative, and company profile are uploaded and split along their own headings into 76 sections. Uploading a newer version replaces the old one, so the library never holds stale copies.

**Writing the note.** For each update the system shortlists which document sections are genuinely relevant, retrieves only those, writes a short note grounded in that text, then verifies the claimed connection actually holds before showing it. If nothing genuinely relates, the note stays general rather than inventing a link.

**The feed itself.** Competitors on the left with unread counts, their updates in the middle filtered by type, each with its note, the document it drew on, and a link to the original source.

**The ask box.** A plain-English question sent straight to Crayon, answered across their full history with sources, reaching further back than the 30-day feed.

---

## 5. Does it do what the client expects?

**Yes on the core promise.** A PM picks a competitor, sees recent product-relevant activity, and each item explains what it means for Litera specifically, citing the actual roadmap or narrative section it drew on. That is the thing the PRD said Crayon's sales-shaped output could not produce.

**Yes on trustworthiness.** Across 48 measured note generations there were zero invented connections. A competitor's CEO change, funding round, or conference appearance is never falsely linked to Litera's strategy. This was tested deliberately and repeatedly, because a confidently wrong note in front of a PM is the failure mode that would kill adoption.

**With two honest qualifications.**

The system is **cautious rather than comprehensive**. Of 54 notes generated, 13 cite a specific document; the rest are useful but general. When it is unsure, it writes something sensible and non-specific instead of forcing a connection. We chose this deliberately, and would rather tune toward more grounding only with the client watching the output.

The **type filter is less granular than the PRD imagined**. The PRD assumed Crayon would label each item (Release, Pricing, API, Docs). It does not, so we derive the type from Crayon's category markers. That covers most updates well, but 45 of 97 land in a general bucket because they are positioning or messaging commentary that genuinely is not a product release. Forcing those into a category would make the filter misleading. This resolves if Crayon enables the Insights API.

---

## 6. Problems found and fixed during this work

Recorded because each was a real defect, not a theoretical one.

**A build failure that would have broken the deploy.** The production build failed intermittently while collecting data for an API route. Thirteen routes were querying the database during the build rather than at request time. Since the deploy runs a production build, this risked a failed deployment that would have passed in casual testing. Fixed and verified with two consecutive clean builds.

**Notes attributing Litera's products to competitors.** Some Crayon briefings contain Crayon's own analysis about Litera, including battlecard-style content naming Litera products. Those were being ingested as competitor news, so one note read "HSO Proserv's Litera Clean+" and another misspelled the company name. Both would have been visible to the client. The analysis content is now filtered out at ingest, and all grounded notes were re-read by hand afterwards.

**Updates being silently dropped.** Crayon writes briefings in two formats and we only handled one, so an entire Intapp/Celeste briefing produced zero updates. That is the competitor the CEO's Q3 priority names. Fixed.

**A stale token overriding a fresh one.** The database held an expired access token that took priority over the environment value, so pasting a valid token appeared to do nothing. Cleared.

**Invented connections, twice.** The first version linked a CEO resignation to Litera's GTM strategy. Tightening then over-corrected so nothing grounded at all. Settled after measuring across three rounds on two models.

---

## 7. Model choice

Measured head to head, 24 note generations each, on the real documents.

| | GPT-5 | Gemini 3.1 Pro |
|---|---|---|
| Correct | 22/24 | 19/24 |
| Invented links | 0 | 0 |
| Speed per note | 38s | 21s |

GPT-5 is the default. It caught the Intapp/Celeste connection every round, which Gemini missed every round, and its notes tell a PM what to do rather than what is. Gemini remains selectable as a faster option for bulk refreshes and as a fallback when the GPT-5 token expires.

Both run on Litera's own gateway, so their documents never reach an outside vendor.

---

## 8. What is still open

**Waiting on Litera**
- The Crayon Insights API decision, which determines whether the type filter becomes precise
- The initial competitor list for Phase One
- Their data-handling review, which we are proceeding ahead of

**Known operational constraint**
- The Litera access token expires roughly hourly. Fine for demos and development, but production needs an automatic token refresh. This is a standard configuration on Litera's side and should be raised before go-live.

**Worth raising**
- The `gemini-flash` model documented in Litera's own API guide is not actually enabled on the gateway. Every naming variant is rejected. Flash would have been the natural choice for bulk generation.
