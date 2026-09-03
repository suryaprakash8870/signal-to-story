-- Task 4 - "what to do next".
-- The interpretation stage (what changed / why it matters / what to do next) was
-- previously an in-memory intermediate, discarded after packaging. Persist the
-- display-relevant fields so a reviewer can see and edit the recommendation.
-- Additive and nullable: existing signals stay null and render without it.
-- Shape: { "signal_summary": "...", "why_it_matters": "...", "what_to_do_next": "..." }.
alter table public.signals
  add column if not exists interpretation jsonb;
