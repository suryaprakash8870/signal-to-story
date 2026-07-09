-- Phase 3 (analytics) + Phase 2 (live connectors) support.

-- --------------------------------------------------------------------------
-- Edit tracking for the approval/edit-rate metric (05-HUMAN-REVIEW-WORKFLOW.md,
-- 09-BUILD-PHASES-AND-TASKS.md). edited_at is stamped the first time a reviewer
-- edits an output's content; edit_count counts edits. "Approval rate without
-- edits" = approved outputs where edited_at is null.
-- --------------------------------------------------------------------------
alter table public.signal_outputs add column if not exists edited_at timestamptz;
alter table public.signal_outputs add column if not exists edit_count int not null default 0;

-- --------------------------------------------------------------------------
-- Rejection tracking. Reject already stamps reviewed_at on the output and sets
-- signals.status='rejected'; add an explicit flag so analytics can separate
-- "rejected" from "pending" without joining back to signals.
-- --------------------------------------------------------------------------
alter table public.signal_outputs add column if not exists rejected boolean not null default false;

-- --------------------------------------------------------------------------
-- Live-connector credentials for inbound connectors reuse the existing
-- credentials_ref + Vault pattern (no schema change needed). This index just
-- speeds up looking a connector up by (type, direction), which the live-mode
-- fetch/polling paths do on every run.
-- --------------------------------------------------------------------------
create index if not exists idx_connectors_type_direction
  on public.connectors(type, direction);
