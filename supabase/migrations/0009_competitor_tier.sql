-- Task 2 - competitor tiers.
-- Adds a 3-tier classification to competitors (1 = Primary, 2 = Secondary,
-- 3 = Watching), confirmed by the discovery response (moving 2 tiers -> 3).
-- Additive and nullable, no default: existing rows stay null ("Unassigned").
-- Tier is DATA ONLY at this stage - nothing in routing/urgency reads it yet.
alter table public.competitors
  add column if not exists tier int check (tier between 1 and 3);
