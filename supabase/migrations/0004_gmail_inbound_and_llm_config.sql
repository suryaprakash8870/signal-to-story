-- Build order step 5: Gmail digest, inbound connectors (test mode), and a
-- website-managed Claude API key.

-- --------------------------------------------------------------------------
-- Dynamic LLM provider config.
-- Deviation from 03-LLM-PROVIDER.md (which says provider is an env var only):
-- by explicit product request, a Claude API key can be added via the website.
-- When a key is present, the pipeline uses Claude automatically; otherwise it
-- falls back to Ollama. The key is Vault-stored (never in the browser), same
-- as connector credentials — only the Vault reference lives in this table.
-- --------------------------------------------------------------------------
create table if not exists public.llm_config (
  id int primary key default 1 check (id = 1),
  claude_credentials_ref text,
  updated_at timestamptz not null default now()
);

insert into public.llm_config (id) values (1) on conflict do nothing;

alter table public.llm_config enable row level security;

create policy "authenticated can read llm_config"
  on public.llm_config for select
  using (auth.role() = 'authenticated');

create policy "reviewers/admins can update llm_config"
  on public.llm_config for update
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role in ('reviewer', 'admin')
    )
  );

-- --------------------------------------------------------------------------
-- Gmail digest tracking. The cadence-driven batch (04-CONNECTORS.md) sends
-- approved outputs that have not yet gone out in a digest; this column marks
-- the ones already sent so they are not resent. Independent of published_at,
-- which tracks the immediate Teams push.
-- --------------------------------------------------------------------------
alter table public.signal_outputs add column if not exists digest_sent_at timestamptz;

-- --------------------------------------------------------------------------
-- Seed the remaining connector rows.
-- Gmail: outbound, weekly cadence default, disconnected until SMTP creds added.
-- Salesforce/Gong/Crayon: inbound, Test Mode (real, working against fixtures).
-- --------------------------------------------------------------------------
insert into public.connectors (type, direction, mode, status, cadence)
select 'gmail', 'outbound', 'live', 'disconnected', 'weekly'
where not exists (select 1 from public.connectors where type = 'gmail' and direction = 'outbound');

insert into public.connectors (type, direction, mode, status, config)
select 'salesforce', 'inbound', 'test', 'connected',
  '{"object":"Opportunity","competitor_field":"Competitor_Mentioned__c","reason_field":"Loss_Reason__c","notes_relation":"Notes"}'::jsonb
where not exists (select 1 from public.connectors where type = 'salesforce' and direction = 'inbound');

insert into public.connectors (type, direction, mode, status)
select 'gong', 'inbound', 'test', 'connected'
where not exists (select 1 from public.connectors where type = 'gong' and direction = 'inbound');

insert into public.connectors (type, direction, mode, status)
select 'crayon', 'inbound', 'test', 'connected'
where not exists (select 1 from public.connectors where type = 'crayon' and direction = 'inbound');
