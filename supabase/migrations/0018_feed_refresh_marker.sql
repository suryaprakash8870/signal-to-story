-- Records when the competitor feed was last refreshed from Crayon.
--
-- The application refreshes on a schedule (see lib/feed/auto-refresh.ts). This
-- marker is what stops a server restart from triggering another full pull:
-- without it the code falls back to the newest stored update, which is close
-- but re-runs whenever a refresh found nothing new.
alter table public.llm_config
  add column if not exists last_feed_refresh_at timestamptz;
