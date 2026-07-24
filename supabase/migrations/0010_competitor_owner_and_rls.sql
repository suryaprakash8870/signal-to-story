-- Task 3 — per-competitor ownership.

-- 3a: owner_id on competitors (nullable; references a user profile).
alter table public.competitors
  add column if not exists owner_id uuid references public.user_profiles(id);

-- 3d: approval RLS becomes per-competitor.
-- Replaces the global "only reviewers/admins can approve" policy with:
--   * admins  — always, OR
--   * the owner of the signal's competitor, OR
--   * any reviewer — but ONLY when the signal has no OWNED competitor.
--
-- That last clause preserves today's behaviour for every signal whose
-- competitor is unassigned OR has no linked/known competitor at all (classify
-- sets competitor_id = null when unmatched). Without it, those signals would
-- become unapprovable by anyone but an admin.
--
-- The `with check` unverified_claims guard is carried over unchanged: an output
-- with outstanding unverified claims still cannot be flipped to approved.
drop policy if exists "only reviewers/admins can approve" on public.signal_outputs;

create policy "owner, admin, or reviewer-when-unowned can approve"
  on public.signal_outputs for update
  using (
    -- admins always
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
    or
    -- the owner of this signal's competitor
    exists (
      select 1
      from public.signals s
      join public.signal_classification sc on sc.signal_id = s.id
      join public.competitors c on c.id = sc.competitor_id
      where s.id = signal_outputs.signal_id
        and c.owner_id = auth.uid()
    )
    or
    -- any reviewer, but only when this signal has NO owned competitor
    (
      exists (
        select 1 from public.user_profiles
        where id = auth.uid() and role in ('reviewer', 'admin')
      )
      and not exists (
        select 1
        from public.signals s
        join public.signal_classification sc on sc.signal_id = s.id
        join public.competitors c on c.id = sc.competitor_id
        where s.id = signal_outputs.signal_id
          and c.owner_id is not null
      )
    )
  )
  with check (
    (unverified_claims = '[]'::jsonb) or (approved = false)
  );
