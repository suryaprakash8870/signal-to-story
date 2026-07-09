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
 * The user's pinned backend from the settings dropdown, or null for auto.
 * Values: 'auto' | 'api' | 'cloudflare' | 'ollama|<baseUrl>|<model>'.
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
