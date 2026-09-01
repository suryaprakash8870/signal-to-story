import { supabaseServiceRole } from '../supabase/server';
import { resolveCredential } from '../connectors/vault';

// --- Config caching ---------------------------------------------------------
//
// Resolving a backend reads config four to six times, and generating one note
// resolves a backend three or four times. That is dozens of identical database
// reads per note for values that change only when someone edits settings.
//
// Two problems come with that, and this cache addresses both:
//
//   1. Cost. The reads are pure overhead once the first has been made.
//   2. Stalls. Supabase queries from this app have been measured intermittently
//      taking 90+ seconds. Without a timeout the whole pipeline blocks on one
//      unlucky read; a note that should take five seconds took 310.
//
// The TTL is deliberately short so a settings change is picked up quickly even
// without an explicit invalidation, and writes call invalidateConfigCache() so
// the change is visible immediately.

const CONFIG_TTL_MS = 15_000;

/** How long a config read may take before we stop waiting and use the fallback. */
const CONFIG_TIMEOUT_MS = 8_000;

const cache = new Map<string, { value: unknown; expires: number }>();

/** Drops every cached config value. Call after any settings write. */
export function invalidateConfigCache(): void {
  cache.clear();
}

/**
 * Reads a config value through the cache, giving up after CONFIG_TIMEOUT_MS.
 *
 * On timeout the last known value is reused when there is one, and `fallback`
 * is used otherwise. Degrading to a slightly stale backend choice is far better
 * than blocking every note for a minute and a half.
 */
async function cached<T>(key: string, load: () => Promise<T>, fallback: T): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), CONFIG_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([load(), timeout]);
    if (result === TIMED_OUT) {
      console.warn(
        `[llm-config] read of "${key}" exceeded ${CONFIG_TIMEOUT_MS}ms; using ${hit ? 'last known value' : 'fallback'}`
      );
      return hit ? (hit.value as T) : fallback;
    }
    cache.set(key, { value: result, expires: Date.now() + CONFIG_TTL_MS });
    return result as T;
  } catch (err) {
    console.warn(
      `[llm-config] read of "${key}" failed (${err instanceof Error ? err.message.slice(0, 90) : String(err)}); using ${hit ? 'last known value' : 'fallback'}`
    );
    return hit ? (hit.value as T) : fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Sentinel so a legitimately-null config value is not mistaken for a timeout. */
const TIMED_OUT = Symbol('config-read-timed-out');


export type ApiProvider = 'claude' | 'gemini';

/**
 * Detects which provider an API key belongs to from its format.
 * Claude keys start with "sk-ant-". Google AI Studio Gemini keys come in two
 * formats: the older "AIza…" and the newer "AQ.…" auth keys. Returns null for
 * anything unrecognized so the save endpoint can reject it clearly.
 */
export function detectProvider(key: string): ApiProvider | null {
  const k = key.trim();
  if (k.startsWith('sk-ant-')) return 'claude';
  if (k.startsWith('AIza') || k.startsWith('AQ.')) return 'gemini';
  return null;
}

/**
 * Resolves the active hosted-API config, if any. Priority:
 *   1. A key added via the website (Vault-stored, provider auto-detected).
 *   2. Env fallback: ANTHROPIC_API_KEY (claude) or GEMINI_API_KEY (gemini).
 * Returns null when neither is set — the caller then uses Ollama.
 */
export async function getApiConfig(): Promise<{ provider: ApiProvider; key: string } | null> {
  return cached('api', loadApiConfig, envApiConfig());
}

/** Env-only view of the hosted-API config, used when the database is slow. */
function envApiConfig(): { provider: ApiProvider; key: string } | null {
  if (process.env.ANTHROPIC_API_KEY) return { provider: 'claude', key: process.env.ANTHROPIC_API_KEY };
  if (process.env.GEMINI_API_KEY) return { provider: 'gemini', key: process.env.GEMINI_API_KEY };
  return null;
}

async function loadApiConfig(): Promise<{ provider: ApiProvider; key: string } | null> {
  try {
    const db = supabaseServiceRole();
    const { data } = await db
      .from('llm_config')
      .select('api_credentials_ref, api_provider')
      .eq('id', 1)
      .maybeSingle();
    if (data?.api_credentials_ref) {
      const key = await resolveCredential(data.api_credentials_ref);
      const provider = (data.api_provider as ApiProvider | null) ?? detectProvider(key);
      if (provider) return { provider, key };
    }
  } catch {
    // Vault/DB unavailable — fall through to the env fallback.
  }

  return envApiConfig();
}

/**
 * Cloudflare Workers AI config from env (a free/cheap TESTING backend). Returns
 * null unless both account id and token are set. Default model is a 32B coder
 * model — reliable JSON shape. For production the token should move to Vault.
 */
export function getCloudflareConfig(): { accountId: string; apiToken: string; model: string } | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) return null;
  return {
    accountId,
    apiToken,
    model: process.env.CLOUDFLARE_MODEL ?? '@cf/qwen/qwen2.5-coder-32b-instruct',
  };
}

/**
 * Litera internal Azure/Entra OpenAI-compatible gateway config from env.
 * Returns null unless both the endpoint URL and the Bearer token are set.
 * NOTE: the token is an Entra JWT that expires (~1h) — fine for testing/demo,
 * but production needs a token-refresh flow, not a static pasted token.
 */
export async function getLiteraConfig(): Promise<{ endpoint: string; token: string; model?: string } | null> {
  return cached('litera', loadLiteraConfig, envLiteraConfig());
}

/** Env-only view, used when the database read is slow or unavailable. */
function envLiteraConfig(): { endpoint: string; token: string; model?: string } | null {
  const endpoint = process.env.LITERA_API_URL;
  const token = process.env.LITERA_API_TOKEN;
  if (!endpoint || !token) return null;
  return { endpoint, token, model: process.env.LITERA_MODEL };
}

async function loadLiteraConfig(): Promise<{ endpoint: string; token: string; model?: string } | null> {
  const endpoint = process.env.LITERA_API_URL;
  if (!endpoint) return null;
  // Token priority: the value saved via the UI (llm_config.litera_token) — so it
  // can be refreshed hourly without editing env/restarting — then the env fallback.
  let token: string | undefined;
  try {
    const db = supabaseServiceRole();
    const { data } = await db.from('llm_config').select('litera_token').eq('id', 1).maybeSingle();
    if (data?.litera_token) token = data.litera_token as string;
  } catch {
    // llm_config.litera_token column not present / DB unavailable → env fallback.
  }
  if (!token) token = process.env.LITERA_API_TOKEN;

  // Renew before it expires rather than failing an hour in. Returns what it was
  // given when no refresh mechanism is configured, so this is never worse than
  // the manual arrangement.
  const { ensureLiteraToken } = await import('./litera-token');
  token = await ensureLiteraToken(token);

  if (!token) return null;
  return { endpoint, token, model: process.env.LITERA_MODEL };
}

/**
 * Google Gemini via Litera's APIM gateway (the gemini-entra path). Uses the
 * SAME Entra token as the GPT-5 gateway — same audience — so no separate
 * credentials are needed. Returns null when the endpoint or token is missing.
 */
export async function getGeminiEntraConfig(): Promise<{
  endpoint: string;
  token: string;
  model: string;
} | null> {
  const endpoint = process.env.GEMINI_ENTRA_URL;
  if (!endpoint) return null;
  // Reuse the Litera token resolution (DB value first, env fallback).
  const litera = await getLiteraConfig();
  const token = litera?.token;
  if (!token) return null;
  return { endpoint, token, model: process.env.GEMINI_ENTRA_MODEL ?? 'gemini-pro' };
}

/**
 * The user's pinned backend from the settings dropdown, or null for auto.
 * Values: 'auto' | 'api' | 'cloudflare' | 'litera' | 'gemini-entra'
 *         | 'ollama|<baseUrl>|<model>'.
 */
export async function getSelectedBackend(): Promise<string | null> {
  return cached('selected', loadSelectedBackend, null);
}

async function loadSelectedBackend(): Promise<string | null> {
  try {
    const db = supabaseServiceRole();
    const { data } = await db
      .from('llm_config')
      .select('selected_backend')
      .eq('id', 1)
      .maybeSingle();
    return data?.selected_backend ?? null;
  } catch {
    return null;
  }
}
