-- Completes Phase 1 of Dale Harris's "Roles, Access, and User Flows".
--
-- Two things:
--
--   1. The competitor list becomes Admin-managed, matching matrix row 10
--      ("Manage competitors, tiers, owners" - Admin Y, PMM R, PM R).
--
--   2. The follow-up gains an owner and a done state, which matrix row 9
--      ("Record action / owner") and step 6 of the PMM flow both require:
--      "Records what should happen next and who owns it, so the follow-up
--      stays visible until marked done."

-- ---------------------------------------------------------------------------
-- 1. Competitors: managed by Admin.
-- ---------------------------------------------------------------------------
-- Row 10 gives only the Admin write access here. A PMM keeps one narrower
-- capability, handled in the API rather than in this policy: they may edit the
-- known facts of a competitor they own.
--
-- That is a deliberate reading of the row rather than a departure from it.
-- "Manage competitors, tiers, owners" is about the shape of the watchlist - who
-- is tracked, at what tier, owned by whom. Known facts are not that; they are
-- the grounding text the interpretation prompt reads, and they are the owning
-- PMM's own material. Requiring an admin to type them would put a ticket in
-- front of routine work and quietly degrade note quality.
--
-- Row-level security cannot express "this role may write only this column", so
-- the facts path goes through the service role behind an ownership check in
-- app/api/competitors/[id]/facts/route.ts.

drop policy if exists "pmm and admin can write competitors" on public.competitors;
drop policy if exists "only reviewers/admins can write competitors" on public.competitors;

create policy "admin can write competitors"
  on public.competitors for all
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. The follow-up: who owns it, and whether it is done.
-- ---------------------------------------------------------------------------
-- `what_to_do_next` already lives inside signals.interpretation. What was
-- missing is the part that makes it a commitment rather than a sentence: a
-- named owner, and a point at which it stops being outstanding.
alter table public.signals
  add column if not exists action_owner_id uuid references public.user_profiles(id),
  add column if not exists action_done_at timestamptz,
  add column if not exists action_done_by uuid references public.user_profiles(id);

-- Outstanding follow-ups are the common query - "what is still open" - so the
-- index covers exactly those rows rather than the whole table.
create index if not exists idx_signals_open_actions
  on public.signals(action_owner_id)
  where action_owner_id is not null and action_done_at is null;
