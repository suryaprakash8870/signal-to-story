-- Connector credential storage via Supabase Vault, per 04-CONNECTORS.md:
-- credentials are never hardcoded, never exposed to the browser, and
-- connectors.credentials_ref stores only a reference (the Vault secret id),
-- never the raw secret.

create extension if not exists supabase_vault with schema vault;

-- Write a secret to Vault and return its id (stored in credentials_ref).
-- SECURITY DEFINER so it can reach the vault schema; execute is restricted
-- to service_role below so the browser/anon can never call it.
create or replace function public.store_connector_secret(p_name text, p_secret text)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = p_name;
  if v_id is null then
    select vault.create_secret(p_secret, p_name) into v_id;
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
  return v_id;
end;
$$;

-- Read a secret back by id. Restricted to service_role - a raw decrypted
-- secret must never be reachable by anon/authenticated, even with the id.
create or replace function public.read_connector_secret(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where id = p_id;
  return v_secret;
end;
$$;

revoke execute on function public.store_connector_secret(text, text) from public, anon, authenticated;
revoke execute on function public.read_connector_secret(uuid) from public, anon, authenticated;
grant execute on function public.store_connector_secret(text, text) to service_role;
grant execute on function public.read_connector_secret(uuid) to service_role;

-- Seed the Teams outbound connector row (build order step 3 wires Teams
-- only). Starts disconnected with no credential; the settings page populates
-- the webhook via the credentials endpoint, which fills credentials_ref.
-- Idempotent guard: connectors has no unique constraint on type.
insert into public.connectors (type, direction, mode, status)
select 'teams', 'outbound', 'live', 'disconnected'
where not exists (
  select 1 from public.connectors where type = 'teams' and direction = 'outbound'
);
