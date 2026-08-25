-- The PM pull interface: individual competitor updates for the per-competitor
-- feed, plus the relevance note generated for each.
--
-- Additive only. The existing signals pipeline is untouched; this is a separate
-- feed for the Product team, running alongside the four-audience tool.
--
-- Path B (see the Phase One plan): Crayon's Insights API is not enabled on the
-- account, so each update is one bullet split out of a Crayon Spark, with the
-- type derived from the Spark's own category emoji. If Crayon enables the
-- Insights API later, the same table is populated from real typed items and
-- nothing downstream changes.

create table if not exists public.competitor_updates (
  id uuid primary key default uuid_generate_v4(),

  -- Competitor as named by Crayon. Kept as text (not a FK) so the feed works
  -- for competitors that have not been added to the competitors table.
  competitor_name text not null,
  competitor_id uuid references public.competitors(id),

  -- Product-signal type. 'other' covers anything not confidently categorised.
  update_type text not null default 'other' check (update_type in
    ('release', 'pricing', 'win', 'expansion', 'risk', 'other')),

  content text not null,
  source_url text,

  -- When Crayon published the briefing this came from. Drives the rolling
  -- 30-day window on the feed.
  published_at timestamptz not null,

  -- Dedup key: same Spark + same bullet index must not be inserted twice.
  spark_id text not null,
  spark_index int not null default 0,

  -- The "why it matters for us" note, generated against the context library.
  relevance_note text,
  -- Which context section grounded the note, when it was grounded.
  grounded_document text,
  grounded_section text,
  note_generated_at timestamptz,

  created_at timestamptz not null default now(),

  unique (spark_id, spark_index)
);

create index if not exists idx_competitor_updates_competitor
  on public.competitor_updates(competitor_name);
create index if not exists idx_competitor_updates_published
  on public.competitor_updates(published_at desc);

alter table public.competitor_updates enable row level security;

-- Any signed-in user can read the feed. This is a browse interface for PMs,
-- with no approval gate, as confirmed with the client.
drop policy if exists "authenticated users can read competitor updates"
  on public.competitor_updates;
create policy "authenticated users can read competitor updates"
  on public.competitor_updates for select
  using (auth.role() = 'authenticated');

-- Writes come from the fetch job (service role) or a reviewer/admin refresh.
drop policy if exists "reviewers and admins can write competitor updates"
  on public.competitor_updates;
create policy "reviewers and admins can write competitor updates"
  on public.competitor_updates for all
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role in ('reviewer', 'admin')
    )
  );
