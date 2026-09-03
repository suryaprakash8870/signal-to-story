-- Task 1 - carry source links through to the reviewer.
-- Crayon Spark content contains footnote links to the underlying insights.
-- These are stripped from raw_text (which feeds the pipeline unchanged); we now
-- also store them separately for display, so a reviewer can open the original in
-- one click. Additive and nullable: existing signals stay null, manual signals
-- stay null. Shape: [{ "ref": "1", "url": "https://app.crayon.co/insight/..." }].
alter table public.signals
  add column if not exists source_links jsonb;
