-- Litera GPT-5 token slot.
-- The Litera Entra token expires ~hourly, so store the current one on
-- llm_config where the AI Provider UI can refresh it without editing env or
-- restarting. Nullable; falls back to the LITERA_API_TOKEN env var when empty.
alter table public.llm_config
  add column if not exists litera_token text;
