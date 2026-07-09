-- Generalize the website-managed LLM API key: instead of Claude-only, one
-- slot that holds any supported provider's key (claude | gemini), detected
-- from the key format at save time. Priority stays: API key → remote Ollama
-- → local Ollama.

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'llm_config'
      and column_name = 'claude_credentials_ref'
  ) then
    alter table public.llm_config rename column claude_credentials_ref to api_credentials_ref;
  end if;
end $$;

alter table public.llm_config
  add column if not exists api_provider text check (api_provider in ('claude', 'gemini'));
