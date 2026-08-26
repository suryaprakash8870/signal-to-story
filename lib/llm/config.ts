import { supabaseServiceRole } from '../supabase/server';
import { resolveCredential } from '../connectors/vault';

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

  if (process.env.ANTHROPIC_API_KEY) return { provider: 'claude', key: process.env.ANTHROPIC_API_KEY };
  if (process.env.GEMINI_API_KEY) return { provider: 'gemini', key: process.env.GEMINI_API_KEY };
  return null;
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
