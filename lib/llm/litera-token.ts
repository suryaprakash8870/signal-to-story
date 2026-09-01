import { execFile } from 'child_process';
import { promisify } from 'util';
import { supabaseServiceRole } from '../supabase/server';

const run = promisify(execFile);

// Keeps a working Entra access token for Litera's gateway.
//
// The token lasts about an hour, and until now it was pasted in by hand. That
// made any job longer than an hour impossible: one note backfill produced 128
// notes over 80 minutes and then failed 61 in a row the moment it expired.
//
// Two ways to get one, tried in order:
//
//   1. Client credentials. An app registration authenticates as itself, with no
//      person involved. This is the production answer and works anywhere,
//      including a deployed server. It needs a client id and secret from
//      Litera, which is the outstanding ask.
//
//   2. Azure CLI. `az account get-access-token` renews silently from the
//      refresh token cached by `az login`, with no MFA prompt. It works only on
//      a machine where someone has signed in, so it is a development
//      convenience rather than a production mechanism.
//
// When neither is available the stored token is used as-is, so behaviour is
// exactly what it was before: it works until it expires.

/** Refresh once the token has less than this long left, rather than on expiry. */
const RENEW_BEFORE_MS = 5 * 60 * 1000;

/** Entra audience for the Litera gateway. */
const RESOURCE = process.env.LITERA_TOKEN_RESOURCE ?? 'api://1b901971-5d24-4468-9f07-ad179037ea61';

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cached: CachedToken | null = null;

/** Reads the `exp` claim. Returns 0 for anything unparseable, forcing a refresh. */
export function tokenExpiry(token: string): number {
  try {
    const payload = token.split('.')[1];
    if (!payload) return 0;
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof json.exp === 'number' ? json.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

function isUsable(token: string | undefined | null): token is string {
  return Boolean(token) && tokenExpiry(token as string) - Date.now() > RENEW_BEFORE_MS;
}

/**
 * Production path: the application authenticates as itself. Returns null when
 * the credentials are not configured, which is the current state.
 */
async function fromClientCredentials(): Promise<string | null> {
  const tenantId = process.env.LITERA_TENANT_ID;
  const clientId = process.env.LITERA_CLIENT_ID;
  const clientSecret = process.env.LITERA_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) return null;

  try {
    const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        // The client-credentials flow takes a scope, not a resource.
        scope: `${RESOURCE}/.default`,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn(`[litera-token] client credentials failed: ${res.status}`);
      return null;
    }
    const data = await res.json();
    return typeof data.access_token === 'string' ? data.access_token : null;
  } catch (err) {
    console.warn(
      `[litera-token] client credentials error: ${err instanceof Error ? err.message.slice(0, 100) : String(err)}`
    );
    return null;
  }
}

/**
 * Development path: renew through the signed-in Azure CLI. Silent, because the
 * CLI holds a refresh token from the original interactive sign-in. Returns null
 * when the CLI is absent or the session has lapsed and needs a real sign-in,
 * which we never attempt from here.
 */
async function fromAzureCli(): Promise<string | null> {
  if (process.env.LITERA_TOKEN_DISABLE_AZ === '1') return null;
  try {
    const { stdout } = await run(
      'az',
      ['account', 'get-access-token', '--resource', RESOURCE, '--query', 'accessToken', '-o', 'tsv'],
      { timeout: 60_000, windowsHide: true, shell: process.platform === 'win32' }
    );
    const token = stdout.trim();
    return token.split('.').length === 3 ? token : null;
  } catch (err) {
    console.warn(
      `[litera-token] azure cli unavailable: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`
    );
    return null;
  }
}

/** Stores a freshly acquired token so other processes and restarts reuse it. */
async function persist(token: string): Promise<void> {
  try {
    const db = supabaseServiceRole();
    await db.from('llm_config').update({ litera_token: token }).eq('id', 1);
    const { invalidateConfigCache } = await import('./config');
    invalidateConfigCache();
  } catch (err) {
    // A token we cannot store still works for this process.
    console.warn(
      `[litera-token] could not store refreshed token: ${err instanceof Error ? err.message.slice(0, 90) : String(err)}`
    );
  }
}

/**
 * Returns a token that is valid now, refreshing it if it is close to expiry.
 *
 * `stored` is whatever the caller already has (the database value, or the env
 * fallback). It is used when it is still good, and returned unchanged when no
 * refresh mechanism is available, so this can never make things worse than the
 * manual arrangement it replaces.
 */
export async function ensureLiteraToken(stored: string | undefined): Promise<string | undefined> {
  if (isUsable(cached?.token)) return cached!.token;
  if (isUsable(stored)) {
    cached = { token: stored, expiresAt: tokenExpiry(stored) };
    return stored;
  }

  const fresh = (await fromClientCredentials()) ?? (await fromAzureCli());
  if (!fresh) return stored;

  const expiresAt = tokenExpiry(fresh);
  cached = { token: fresh, expiresAt };
  await persist(fresh);

  const minutes = Math.round((expiresAt - Date.now()) / 60000);
  console.log(`[litera-token] refreshed automatically, valid for ${minutes} minutes`);
  return fresh;
}

/** Which mechanism is available right now, for the settings screen. */
export async function tokenRefreshMode(): Promise<'client-credentials' | 'azure-cli' | 'manual'> {
  if (process.env.LITERA_CLIENT_ID && process.env.LITERA_CLIENT_SECRET && process.env.LITERA_TENANT_ID) {
    return 'client-credentials';
  }
  return (await fromAzureCli()) ? 'azure-cli' : 'manual';
}
