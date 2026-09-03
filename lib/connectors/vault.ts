import { supabaseServiceRole } from '../supabase/server';

// Server-side only. Resolves and stores connector credentials via Supabase
// Vault (04-CONNECTORS.md). NEVER import this from client code, and NEVER
// return a resolved value in an API response body - resolve and use it in
// the same server-side function.

/** Store (or overwrite) a secret in Vault; returns the id for credentials_ref. */
export async function storeCredential(name: string, value: string): Promise<string> {
  const db = supabaseServiceRole();
  const { data, error } = await db.rpc('store_connector_secret', {
    p_name: name,
    p_secret: value,
  });
  if (error) throw new Error(`failed to store credential: ${error.message}`);
  return data as string;
}

/** Resolve a secret from Vault by its credentials_ref id. */
export async function resolveCredential(ref: string): Promise<string> {
  const db = supabaseServiceRole();
  const { data, error } = await db.rpc('read_connector_secret', { p_id: ref });
  if (error) throw new Error(`failed to resolve credential: ${error.message}`);
  if (!data) throw new Error('credential not found in Vault');
  return data as string;
}
