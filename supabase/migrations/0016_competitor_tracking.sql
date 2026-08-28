-- Marks which competitors are on Litera's official Phase One watchlist.
--
-- Litera's list and Crayon's watchlist are not the same set: Crayon tracks some
-- competitors Litera has not listed, and Litera lists some Crayon does not yet
-- track. The PM feed should show Litera's list, not Crayon's, so updates for
-- untracked competitors are discarded at ingest and the rail shows every listed
-- competitor including those with no data yet.
--
-- Additive and defaulted to true, so nothing that already exists changes
-- behaviour until the list is seeded.
alter table public.competitors
  add column if not exists tracked boolean not null default true;

-- Whether Crayon currently has any data for this competitor. Lets the UI say
-- "not tracked in Crayon" rather than leaving a PM to guess why a competitor is
-- empty. Null means unknown / not yet checked.
alter table public.competitors
  add column if not exists in_crayon boolean;
