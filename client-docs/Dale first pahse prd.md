Hey
Ajay, putting some time on your calendar tomorrow to discuss, but take a look at this basic PRD for a first phase of Compete Agent. I listed to what Rowan presented to the product org today and I think if we can get this stood up as an MVP it would align with what he spoke about.
 
Summary
A pull interface where PMs see what competitors shipped in the last 30 days, filtered to product signal, each update carrying a short "why it matters for us" note grounded in the team's own roadmaps and strategy docs. Runs on the Crayon partner API the company already licenses. It closes the gap between a CI subscription that CI lead lives in and a PM team that never logs into Crayon.
Problem
Crayon surfaces everything a competitor does: PR, social, hiring, positioning, product. A PM planning a roadmap needs one slice of that (what shipped, what changed in docs, what moved on pricing) and needs it framed as a build decision, not a sales talk track. Today that framing doesn't exist for them, so PMs either ignore Crayon or spend an afternoon reconstructing it by hand before a planning meeting.
Users and primary job
Product managers, work competitor-first: pick a competitor, then look at what it shipped or changed over the period. Primary job: "Show me what this competitor did in the last 30 days, and whether it should change what I build."
Secondary users: PM leads scanning several competitors before a roadmap review.
Goals
A PM can see every product-relevant competitor update from the last 30 days in under a minute.
Each update carries a relevance note that helps a build decision (parity gap, table-stakes signal, don't-build call).
The tool answers "what changed since I last looked" without the PM tracking it themselves.
Non-goals
Not a battlecard or sales-enablement tool. That's Crayon's existing job for the CI team.
Not covering non-product signal (PR, social, exec moves). Filtered out on purpose.
Not replacing Crayon. It reads from Crayon and reframes for one audience.
No push/digest in v1. Pull interface only.
Constraints
Rolling 30-day window on the feed. The per-competitor feed shows updates from the past 30 days only; nothing older appears there. It's a current-state radar, not an archive.
The ask box is the exception. Questions reach back beyond 30 days across the full history Crayon holds, so a PM can ask about last quarter even though the feed won't list those items.
Core features
Per-competitor feed. Left rail lists competitors with unread counts. Selecting one shows its product updates, newest first, scoped to the last 30 days. Unread count clears on view — this is the reason a pull interface gets reopened.
Product-signal filter. Only changelog, release, docs, and pricing captures pass through. Filter chips (Release / Pricing / API / Docs) narrow the feed.
"Why it matters for us" note. One or two sentences per update. Where the update touches something in the uploaded context (a roadmap item, a GTM bet, a positioning claim), the note draws on it and says which doc, e.g. "overlaps the Q3 permissions epic in your roadmap." Where nothing in the context bears on it, the note stays general instead of inventing a link. The value of the tool lives here, so it gets the most design attention.
Ask box. Natural-language question across all competitors, scoped to product but not to the 30-day window ("what changed in permissions last quarter"), answered with links back to the source captures. This is the one surface that reaches past 30 days.
Context (the "us" the note reasons against)
The relevance note needs to know what the company is building and betting on. Teams upload their own context: product roadmaps, GTM strategy docs, positioning and messaging, area briefs. The tool indexes them and the note pulls from them where an update is relevant, naming the doc it drew on so the PM can trust the connection.
 
This is the heart of the tool. A note grounded in the actual roadmap ("this closes a gap you have slated for Q4") is worth far more than a generic one, and it's the thing Crayon's sales-shaped output can't produce.
PMM owns the context library: uploading roadmaps and strategy docs and keeping them current. Stale context is the main failure mode, so ownership sits with one team, not the whole PM group.
Dependencies
Crayon partner API (Content endpoint for captures, Answers endpoint or own retrieval for the ask box). Assumed to return source-level items with timestamp, type, and competitor fields, and to support incremental fetch.
Model access for generating relevance notes and answers.
Document upload, storage, and indexing for context (roadmaps, GTM docs, positioning), with per-area or company-wide scoping and retrieval into the note generator.
Success metrics
Weekly active PMs (target: majority of the PM team by week 6).
Share of relevance notes marked useful (thumbs signal on the note).
Self-reported time to learn about a competitor move, before vs after.
The real risk is non-adoption, so the primary metric is repeat weekly use, not coverage.
 
In: pull interface, per-competitor feed (rolling 30-day window), product-signal filter, context upload with scoping, relevance notes grounded in context, ask box, unread counts.
Later: area-first view, saved searches, note quality tuning, a push digest if pull adoption stalls.