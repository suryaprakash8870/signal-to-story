-- Context library: Litera's own strategy documents, used to ground the
-- "why it matters for us" relevance note on the PM tool.
--
-- Additive only. Nothing existing reads or writes these tables, so the current
-- pipeline and UI are unaffected.
--
-- Two tables:
--   context_documents  - one row per uploaded document (roadmap, GTM, etc.)
--   context_sections   - that document split along its own headings, one row
--                        per section. The relevance note is grounded against
--                        individual sections, not whole documents, so the model
--                        only ever sees the part that is actually relevant.

create table if not exists public.context_documents (
  id uuid primary key default uuid_generate_v4(),
  -- What kind of document this is. Drives how it is described to the model.
  doc_type text not null check (doc_type in
    ('roadmap', 'gtm_strategy', 'positioning', 'growth_story', 'company_profile', 'other')),
  title text not null,
  -- Original filename, for display and for replace-in-place uploads.
  file_name text,
  -- Full extracted plain text, kept for reference and re-sectioning.
  full_text text not null,
  word_count int,
  uploaded_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  -- Surfaced in the UI so a stale context library is visible, not hidden.
  updated_at timestamptz not null default now()
);

create table if not exists public.context_sections (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid not null references public.context_documents(id) on delete cascade,
  -- The document's own heading for this section, used verbatim in the
  -- shortlisting step so the model judges relevance from real section titles.
  heading text not null,
  content text not null,
  -- Preserves document order for display and for stable citations.
  position int not null default 0,
  word_count int,
  created_at timestamptz not null default now()
);

create index if not exists idx_context_sections_document_id
  on public.context_sections(document_id);

alter table public.context_documents enable row level security;
alter table public.context_sections enable row level security;

-- Any signed-in user may read the context library (PMs need it to see which
-- document a note was grounded in).
create policy "authenticated users can read context documents"
  on public.context_documents for select
  using (auth.role() = 'authenticated');

create policy "authenticated users can read context sections"
  on public.context_sections for select
  using (auth.role() = 'authenticated');

-- Only reviewers/admins may upload or replace context. PMM owns keeping the
-- library current, so writes stay restricted to those roles.
create policy "reviewers and admins can write context documents"
  on public.context_documents for all
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role in ('reviewer', 'admin')
    )
  );

create policy "reviewers and admins can write context sections"
  on public.context_sections for all
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role in ('reviewer', 'admin')
    )
  );
