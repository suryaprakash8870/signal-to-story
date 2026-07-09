-- Signal-to-Story Engine — initial schema.
-- See D:\signal to story\01-DATA-MODEL.md for the authoritative spec this
-- migration implements. Tables are created in FK dependency order; RLS is
-- enabled on every table before any app code runs against it.

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- user_profiles
-- ---------------------------------------------------------------------------
create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'submitter' check (role in ('submitter', 'reviewer', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "users can read all profiles"
  on public.user_profiles for select
  using (true);

create policy "users can update own profile"
  on public.user_profiles for update
  using (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- competitors
-- ---------------------------------------------------------------------------
create table public.competitors (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  known_facts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.competitors enable row level security;

create policy "all authenticated users can read competitors"
  on public.competitors for select
  using (auth.role() = 'authenticated');

create policy "only reviewers/admins can write competitors"
  on public.competitors for all
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role in ('reviewer', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- signals
-- ---------------------------------------------------------------------------
create table public.signals (
  id uuid primary key default uuid_generate_v4(),
  raw_text text not null,
  raw_text_hash text generated always as (md5(raw_text)) stored,
  source_type text not null check (source_type in
    ('gong', 'salesforce', 'teams', 'crayon', 'website', 'news', 'manual')),
  source_ref text,
  submitted_by uuid references public.user_profiles(id),
  submitted_at timestamptz not null default now(),
  status text not null default 'draft' check (status in
    ('draft', 'classified', 'interpreted', 'packaged', 'reviewed', 'published', 'rejected', 'error'))
);

create index idx_signals_status on public.signals(status);
create index idx_signals_raw_text_hash on public.signals(raw_text_hash);

alter table public.signals enable row level security;

create policy "authenticated users can read signals"
  on public.signals for select
  using (auth.role() = 'authenticated');

create policy "authenticated users can insert signals"
  on public.signals for insert
  with check (auth.role() = 'authenticated');

-- status transitions beyond insert (classified/interpreted/packaged/error)
-- are written by the backend using the service role, which bypasses RLS —
-- see lib/supabase/server.ts. No client-side update policy is defined.

-- ---------------------------------------------------------------------------
-- signal_classification
-- ---------------------------------------------------------------------------
create table public.signal_classification (
  signal_id uuid primary key references public.signals(id) on delete cascade,
  competitor_id uuid references public.competitors(id),
  signal_type text not null,
  business_area text not null,
  urgency text not null check (urgency in ('low', 'medium', 'high')),
  audience_relevance jsonb not null,
  classified_at timestamptz not null default now()
);

alter table public.signal_classification enable row level security;

create policy "authenticated users can read classification"
  on public.signal_classification for select
  using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- signal_outputs
-- ---------------------------------------------------------------------------
create table public.signal_outputs (
  id uuid primary key default uuid_generate_v4(),
  signal_id uuid not null references public.signals(id) on delete cascade,
  audience text not null check (audience in
    ('sales', 'product', 'marketing', 'leadership')),
  output_type text not null check (output_type in
    ('talk_track', 'watchout', 'marketing_angle', 'leadership_summary',
     'battlecard_snippet', 'live_talking_points')),
  content text not null,
  unverified_claims jsonb not null default '[]'::jsonb,
  reviewed_by uuid references public.user_profiles(id),
  reviewed_at timestamptz,
  approved boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_signal_outputs_signal_id on public.signal_outputs(signal_id);
create index idx_signal_outputs_approved on public.signal_outputs(approved)
  where approved = false;

alter table public.signal_outputs enable row level security;

create policy "authenticated users can read outputs"
  on public.signal_outputs for select
  using (auth.role() = 'authenticated');

create policy "only reviewers/admins can approve"
  on public.signal_outputs for update
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role in ('reviewer', 'admin')
    )
  )
  with check (
    (unverified_claims = '[]'::jsonb) or (approved = false)
  );

-- ---------------------------------------------------------------------------
-- connectors
-- ---------------------------------------------------------------------------
create table public.connectors (
  id uuid primary key default uuid_generate_v4(),
  type text not null check (type in
    ('teams', 'gmail', 'salesforce', 'gong', 'crayon')),
  direction text not null check (direction in ('inbound', 'outbound')),
  mode text not null default 'test' check (mode in ('test', 'live')),
  credentials_ref text,
  config jsonb not null default '{}'::jsonb,
  status text not null default 'disconnected' check (status in
    ('connected', 'disconnected', 'error')),
  cadence text check (cadence in ('weekly', 'biweekly')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.connectors enable row level security;

create policy "authenticated users can read connector status"
  on public.connectors for select
  using (auth.role() = 'authenticated');

create policy "only admins can modify connectors"
  on public.connectors for all
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );
