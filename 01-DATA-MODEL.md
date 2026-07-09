# 01 — Data Model

Postgres via Supabase. Create tables in this order (foreign key dependency
order). Enable Row-Level Security on every table before writing any app
code against it — do not add RLS as an afterthought.

## Extension

```sql
create extension if not exists "uuid-ossp";
```

## `users` (Supabase Auth handles the base table — this extends it)

```sql
create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'submitter', -- submitter | reviewer | admin
  created_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "users can read all profiles"
  on public.user_profiles for select
  using (true);

create policy "users can update own profile"
  on public.user_profiles for update
  using (auth.uid() = id);
```

Roles are intentionally simple (submitter / reviewer / admin) — every
downstream RLS policy in this document checks against this table.

## `competitors`

```sql
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
```

`known_facts` shape (array of objects, each independently citable by the
grounding step in stage 3):

```json
[
  { "fact": "Litera's product includes native Word integration for drafting.", "source": "internal", "added_by": "<user_id>", "added_at": "2026-06-01" }
]
```

## `signals`

```sql
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
    ('draft', 'classified', 'interpreted', 'packaged', 'reviewed', 'published', 'rejected'))
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
```

`raw_text_hash` + its index exist specifically to support the dedupe check
in `10-OPTIMIZATION-NOTES.md` — before re-running the pipeline on a signal,
check whether this hash already exists with `status != 'rejected'`.

**Note:** `source_type` currently lists Gong, Salesforce, Teams, Crayon,
Website, News, Manual. This list is provisional — confirm the complete,
current list of sources against Dale's source itemization before treating
this constraint as final. Adding a source later is a one-line migration
(`alter table ... drop constraint ... add constraint ...`), not a redesign.

## `signal_classification`

```sql
create table public.signal_classification (
  signal_id uuid primary key references public.signals(id) on delete cascade,
  competitor_id uuid references public.competitors(id),
  signal_type text not null,
  business_area text not null,
  urgency text not null check (urgency in ('low', 'medium', 'high')),
  audience_relevance jsonb not null,
  -- e.g. {"sales":"high","product":"medium","marketing":"high","leadership":"medium"}
  classified_at timestamptz not null default now()
);

alter table public.signal_classification enable row level security;

create policy "authenticated users can read classification"
  on public.signal_classification for select
  using (auth.role() = 'authenticated');
```

Writes to this table happen only from the backend (service role), never
directly from the client — the classification is a pipeline output, not
user input.

## `signal_outputs`

```sql
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
  where approved = false; -- speeds up the review queue query specifically

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
    -- cannot approve if unverified_claims is non-empty
    (unverified_claims = '[]'::jsonb) or (approved = false)
  );
```

The `with check` clause is the actual enforcement of the "unverified claims
must be resolved before approval" rule — see `05-HUMAN-REVIEW-WORKFLOW.md`
for how the UI surfaces this, but the database is what actually blocks it.

## `connectors`

```sql
create table public.connectors (
  id uuid primary key default uuid_generate_v4(),
  type text not null check (type in
    ('teams', 'gmail', 'salesforce', 'gong', 'crayon')),
  direction text not null check (direction in ('inbound', 'outbound')),
  mode text not null default 'test' check (mode in ('test', 'live')),
  credentials_ref text, -- reference/key into Supabase Vault, never the raw secret
  config jsonb not null default '{}'::jsonb,
  -- e.g. for salesforce: {"object": "Opportunity", "competitor_field": "Competitor_Mentioned__c", ...}
  status text not null default 'disconnected' check (status in
    ('connected', 'disconnected', 'error')),
  cadence text check (cadence in ('weekly', 'biweekly')), -- only relevant for outbound digest
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
```

`credentials_ref` never stores the actual API key/token — it stores a
reference (e.g. a Vault secret name) that the backend resolves server-side.
See `04-CONNECTORS.md`.

## Field-mapping config example for Salesforce (stored in `connectors.config`)

```json
{
  "object": "Opportunity",
  "competitor_field": "Competitor_Mentioned__c",
  "reason_field": "Loss_Reason__c",
  "notes_relation": "Notes"
}
```

This is illustrative, not confirmed — see `04-CONNECTORS.md` and
`08-TEST-FIXTURES-AND-TESTING.md`.
