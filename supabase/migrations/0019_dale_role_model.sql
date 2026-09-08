-- Phase 1 of the role model in Dale Harris's "Roles, Access, and User Flows".
--
-- Five roles replace the original three. The mapping is a rename, not a
-- redesign, because the behaviour already matched:
--
--   reviewer  -> pmm       packages and distributes; owns competitors
--   submitter -> pm        researches the feed and Ask Box; cannot distribute
--   admin     -> admin     unchanged
--
-- Two roles are declared now but carry no capability yet, because Dale's
-- rollout puts them in later phases:
--
--   consumer  receives content in Teams and email (Phase 2)
--   viewer    read-only observer (later, and only if asked for)
--
-- Declaring them now means adding a person as a Consumer never requires a
-- schema change, and a Consumer who signs in gets read access and nothing more
-- rather than accidentally inheriting a working role.
--
-- The two design rules from section 3 of the document are already enforced by
-- the ownership policies introduced in migration 0010: only the PMM who owns a
-- competitor can approve its content, and query rights are separate from
-- distribution rights. This migration carries those policies across to the new
-- role names without changing their logic.

-- ---------------------------------------------------------------------------
-- 1. Widen the allowed roles, migrate existing rows, then tighten again.
-- ---------------------------------------------------------------------------

-- The default has to be dropped before the data migration: 'submitter' stops
-- being a legal value, and a column default is validated against the new
-- constraint.
alter table public.user_profiles alter column role drop default;

alter table public.user_profiles drop constraint if exists user_profiles_role_check;

update public.user_profiles set role = 'pmm' where role = 'reviewer';
update public.user_profiles set role = 'pm'  where role = 'submitter';

alter table public.user_profiles
  add constraint user_profiles_role_check
  check (role in ('admin', 'pmm', 'pm', 'consumer', 'viewer'));

-- New accounts land as PM: they can research the feed and the Ask Box, and can
-- do nothing that reaches another team. Promotion to PMM is a deliberate act by
-- an admin. The old default, 'submitter', granted no useful access at all.
alter table public.user_profiles alter column role set default 'pm';

-- ---------------------------------------------------------------------------
-- 2. Carry every policy across to the new names.
-- ---------------------------------------------------------------------------
-- Logic is unchanged throughout; only 'reviewer' becomes 'pmm'. Each policy is
-- dropped by its original name and recreated, so this is safe to re-run.

-- competitors: PMM and admin may write.
drop policy if exists "only reviewers/admins can write competitors" on public.competitors;
create policy "pmm and admin can write competitors"
  on public.competitors for all
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role in ('pmm', 'admin')
    )
  );

-- llm_config: model backend and credentials.
drop policy if exists "reviewers/admins can update llm_config" on public.llm_config;
create policy "pmm and admin can update llm_config"
  on public.llm_config for update
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role in ('pmm', 'admin')
    )
  );

-- signal_outputs approval. This is Dale's rule one: the owning PMM approves.
-- Admin always may; a PMM may act on a signal whose competitor has no owner,
-- so an unassigned competitor does not become unapprovable by anyone.
drop policy if exists "owner, admin, or reviewer-when-unowned can approve" on public.signal_outputs;
drop policy if exists "only reviewers/admins can approve" on public.signal_outputs;
create policy "owner, admin, or pmm-when-unowned can approve"
  on public.signal_outputs for update
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
    or
    exists (
      select 1
      from public.signals s
      join public.signal_classification sc on sc.signal_id = s.id
      join public.competitors c on c.id = sc.competitor_id
      where s.id = signal_outputs.signal_id
        and c.owner_id = auth.uid()
    )
    or
    (
      exists (
        select 1 from public.user_profiles
        where id = auth.uid() and role in ('pmm', 'admin')
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

-- artifacts: same ownership rule, resolved through the linked signals.
drop policy if exists "owner, admin, or reviewer-when-unowned can approve artifacts" on public.artifacts;
create policy "owner, admin, or pmm-when-unowned can approve artifacts"
  on public.artifacts for update
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
    or
    exists (
      select 1
      from public.artifact_signals asig
      join public.signals s on s.id = asig.signal_id
      join public.signal_classification sc on sc.signal_id = s.id
      join public.competitors c on c.id = sc.competitor_id
      where asig.artifact_id = artifacts.id
        and c.owner_id = auth.uid()
    )
    or
    (
      exists (
        select 1 from public.user_profiles
        where id = auth.uid() and role in ('pmm', 'admin')
      )
      and not exists (
        select 1
        from public.artifact_signals asig
        join public.signals s on s.id = asig.signal_id
        join public.signal_classification sc on sc.signal_id = s.id
        join public.competitors c on c.id = sc.competitor_id
        where asig.artifact_id = artifacts.id
          and c.owner_id is not null
      )
    )
  )
  with check (
    (unverified_claims = '[]'::jsonb) or (approved = false)
  );

-- context library: PMM owns keeping it current.
drop policy if exists "reviewers and admins can write context documents" on public.context_documents;
create policy "pmm and admin can write context documents"
  on public.context_documents for all
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role in ('pmm', 'admin')
    )
  );

drop policy if exists "reviewers and admins can write context sections" on public.context_sections;
create policy "pmm and admin can write context sections"
  on public.context_sections for all
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role in ('pmm', 'admin')
    )
  );

-- competitor_updates: written by the refresh job (service role) or by hand.
drop policy if exists "reviewers and admins can write competitor updates" on public.competitor_updates;
create policy "pmm and admin can write competitor updates"
  on public.competitor_updates for all
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role in ('pmm', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- 3. New accounts.
-- ---------------------------------------------------------------------------
-- The signup trigger from migration 0002 inserts an explicit 'submitter',
-- which is no longer a legal role. Recreated to insert 'pm'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'pm'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
