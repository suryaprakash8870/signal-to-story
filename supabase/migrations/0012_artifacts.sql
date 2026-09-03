-- Task 5 - loosen the output-to-signal relationship (schema only).
--
-- Today a signal_output belongs to exactly one signal. Some distribution
-- formats (a weekly digest, an MBR) combine MANY signals into one artifact.
-- Rather than migrate signal_outputs under load later, add the many-to-one
-- structure now, ALONGSIDE the existing table.
--
-- IMPORTANT: nothing writes to or reads from these tables yet. signal_outputs
-- and every existing query/route/component are untouched. This migration is
-- invisible to users; it only makes the schema ready for later work.

-- ---------------------------------------------------------------------------
-- artifacts - a reviewable piece of content that may combine many signals.
-- Mirrors signal_outputs' approval fields (unverified_claims / reviewed_by /
-- reviewed_at / approved / published_at) so the review flow can be reused.
-- ---------------------------------------------------------------------------
create table if not exists public.artifacts (
  id uuid primary key default uuid_generate_v4(),
  type text not null check (type in ('readout', 'digest', 'teardown', 'mbr')),
  audience text not null check (audience in
    ('sales', 'product', 'marketing', 'leadership')),
  content text,
  status text not null default 'draft' check (status in
    ('draft', 'pending_review', 'approved', 'published')),
  unverified_claims jsonb not null default '[]'::jsonb,
  reviewed_by uuid references public.user_profiles(id),
  reviewed_at timestamptz,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

-- ---------------------------------------------------------------------------
-- artifact_signals - join table: which signals an artifact was built from.
-- ---------------------------------------------------------------------------
create table if not exists public.artifact_signals (
  artifact_id uuid not null references public.artifacts(id) on delete cascade,
  signal_id uuid not null references public.signals(id) on delete cascade,
  primary key (artifact_id, signal_id)
);
create index if not exists idx_artifact_signals_signal_id
  on public.artifact_signals(signal_id);

-- ---------------------------------------------------------------------------
-- RLS - mirror the signal_outputs approval policy (Task 3), scoped by the
-- competitors of the artifact's linked signals.
-- ---------------------------------------------------------------------------
alter table public.artifacts enable row level security;
alter table public.artifact_signals enable row level security;

-- Policies are dropped-if-exists first so this migration is safely re-runnable
-- (create policy has no "if not exists" form).
drop policy if exists "authenticated users can read artifacts" on public.artifacts;
create policy "authenticated users can read artifacts"
  on public.artifacts for select
  using (auth.role() = 'authenticated');

drop policy if exists "authenticated users can read artifact_signals" on public.artifact_signals;
create policy "authenticated users can read artifact_signals"
  on public.artifact_signals for select
  using (auth.role() = 'authenticated');

-- Approve/update an artifact: admin, OR the owner of any linked signal's
-- competitor, OR any reviewer when the artifact has NO owned competitor among
-- its linked signals (mirrors the Task 3 fallback so unowned artifacts stay
-- approvable). The unverified_claims guard is carried over unchanged.
drop policy if exists "owner, admin, or reviewer-when-unowned can approve artifacts" on public.artifacts;
create policy "owner, admin, or reviewer-when-unowned can approve artifacts"
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
        where id = auth.uid() and role in ('reviewer', 'admin')
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
