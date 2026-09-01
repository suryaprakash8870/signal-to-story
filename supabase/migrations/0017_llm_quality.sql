-- Supports the LLM reliability and accuracy work.
--
-- Everything here is additive and nullable, so existing rows and existing code
-- keep working unchanged until each feature is switched on.

-- === Type classification =====================================================
-- How this update's type was decided: 'emoji' (Crayon's own label, most
-- reliable), 'keyword' (our regex fallback), or 'model' (classified by the LLM
-- when the first two could not tell). Recorded so we can measure which layer is
-- carrying the load and re-run only the model-classified ones if the prompt
-- improves.
alter table public.competitor_updates
  add column if not exists type_source text
    check (type_source is null or type_source in ('emoji', 'keyword', 'model'));

-- === Note provenance and caching ============================================
-- Which model wrote the note. Notes generated on different backends are not a
-- consistent quality baseline, so the feed needs to be able to say which is
-- which, and a re-run can target only the ones from a weaker model.
alter table public.competitor_updates
  add column if not exists note_model text;

-- Hash of the exact input the note was generated from (update text + the
-- context sections used). Lets a regenerate return the stored note when nothing
-- has changed, which is what makes the output stable rather than a fresh
-- variation every time.
alter table public.competitor_updates
  add column if not exists note_input_hash text;

-- === Accuracy feedback ======================================================
-- A reader's judgement on a note: 1 = useful, -1 = not useful. This is the only
-- ongoing signal of whether note quality holds as the competitor list grows.
alter table public.competitor_updates
  add column if not exists note_feedback smallint
    check (note_feedback is null or note_feedback in (-1, 1));
alter table public.competitor_updates
  add column if not exists note_feedback_at timestamptz;
-- Plain uuid rather than a foreign key to auth.users on purpose: adding a
-- constraint against the auth schema needs privileges the SQL editor does not
-- always have, and because the editor runs a script as one transaction, that
-- single statement failing rolls the whole migration back. The value is only
-- ever written from server code that already holds an authenticated user id.
alter table public.competitor_updates
  add column if not exists note_feedback_by uuid;

-- === Section embeddings =====================================================
-- Vector for each context section, used to shortlist relevant sections without
-- a model call. Stored as jsonb rather than a pgvector column deliberately:
-- there are only ~76 sections, so cosine similarity in application code is
-- instant and this carries no database extension dependency.
alter table public.context_sections
  add column if not exists embedding jsonb;
alter table public.context_sections
  add column if not exists embedding_model text;

-- Finding un-embedded sections is a routine lookup during backfill.
create index if not exists context_sections_embedding_missing_idx
  on public.context_sections (id)
  where embedding is null;

-- Feed queries filter to updates lacking a note; keep that cheap as the table
-- grows past the current 721 rows.
create index if not exists competitor_updates_note_missing_idx
  on public.competitor_updates (competitor_name, published_at desc)
  where relevance_note is null;
