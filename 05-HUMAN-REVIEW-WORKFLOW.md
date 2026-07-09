# 05 — Human Review & Approval Workflow

This is the system's main safety control. It is enforced at the database
layer (see the RLS policy on `signal_outputs` in `01-DATA-MODEL.md`), not
only in the UI — a direct API call cannot bypass it.

## States

```
packaged → pending_review → (approved | rejected)
approved → published (once pushed by a connector)
```

## Review queue query

```sql
select so.*, s.raw_text, s.source_type, sc.competitor_id, sc.urgency
from signal_outputs so
join signals s on s.id = so.signal_id
join signal_classification sc on sc.signal_id = so.signal_id
where so.approved = false and so.published_at is null
order by
  case sc.urgency when 'high' then 0 when 'medium' then 1 else 2 end,
  so.created_at asc;
```

Ordered by urgency first — this matters once volume grows; see the
queue-backlog note below.

## Reviewer actions

1. **Approve as-is** — sets `approved = true`, `reviewed_by`, `reviewed_at`.
   Blocked by RLS if `unverified_claims` is non-empty (see `01`) — the UI
   should surface this as "resolve flagged claims before approving," not
   a generic error.
2. **Edit then approve** — reviewer edits `content` directly, then
   approves. Store the edit — this is the data source for the
   approval/edit-rate metric in `10-OPTIMIZATION-NOTES.md` and
   `09-BUILD-PHASES-AND-TASKS.md`.
3. **Reject** — sets `signals.status = 'rejected'`. Does not delete the
   signal or its classification; keeps it for later analysis of what gets
   rejected and why.
4. **Resolve unverified claim** — a specific action, not just an edit:
   the reviewer either confirms the claim (moves it out of
   `unverified_claims` into the main `content`, now backed by human
   judgment) or removes it. Only after this can approval succeed.

## Metrics to track from day one (not a "nice to have" — this is how you
find out if the system is working)

- **Approval rate without edits** — the clearest proxy for whether
  Classification/Interpretation/Packaging quality is good enough.
- **Review queue throughput** — time from `packaged` to `approved`/
  `rejected`. Track this explicitly. If real signal volume causes this
  queue to back up, that's the bottleneck relocating from "Dale writes
  everything manually" to "the reviewer can't keep up" — same underlying
  problem, one stage downstream. The fix, if this happens, is better
  triage (the urgency-ordered queue above, or routing only `high`
  audience-relevance items to review by default and letting `medium`
  accumulate for a lower-frequency batch pass) — not weakening the gate
  itself.

## RLS enforcement recap (see `01-DATA-MODEL.md` for the actual SQL)

Only users with `role in ('reviewer', 'admin')` in `user_profiles` can
update `signal_outputs`, and the `with check` clause blocks setting
`approved = true` while `unverified_claims` is non-empty. This means the
gate holds even if someone calls the API directly, bypassing the frontend
entirely.
