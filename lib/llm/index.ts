import type { LLMProvider } from './provider';
import { ClaudeProvider } from './claude-provider';
import { GeminiProvider } from './gemini-provider';
import { OllamaProvider } from './ollama-provider';
import { CloudflareProvider } from './cloudflare-provider';
import { LiteraProvider } from './litera-provider';
import { GeminiEntraProvider } from './gemini-entra-provider';
import {
  getApiConfig,
  getSelectedBackend,
  getCloudflareConfig,
  getLiteraConfig,
  getGeminiEntraConfig,
} from './config';
import { selectOllama, ollamaChain } from './ollama-select';
import { FallbackProvider } from './fallback';

type Link = { label: string; provider: LLMProvider };

function apiProvider(api: { provider: 'claude' | 'gemini'; key: string }): LLMProvider {
  return api.provider === 'claude' ? new ClaudeProvider(api.key) : new GeminiProvider(api.key);
}

function parsePinnedOllama(selection: string): { url: string; model: string } {
  const firstBar = selection.indexOf('|');
  const secondBar = selection.indexOf('|', firstBar + 1);
  return {
    url: selection.slice(firstBar + 1, secondBar),
    model: selection.slice(secondBar + 1),
  };
}

/**
 * Resolves the provider for a pipeline call, at call time.
 *
 * STRICT selection (the default the user picks in the dropdown): when a
 * specific model is pinned, ONLY that model runs — no fallback to any other
 * model. If it fails, the signal errors clearly rather than silently switching.
 *
 * AUTO (only if the user explicitly picks "Auto"): the fallback chain
 * hosted API → network Ollama → local Ollama, so a failure still completes.
 */
export async function getLLMProvider(): Promise<LLMProvider> {
  const [api, selection] = await Promise.all([getApiConfig(), getSelectedBackend()]);

  // STRICT — pinned to a specific Ollama endpoint+model. Only this runs.
  if (selection && selection.startsWith('ollama|')) {
    const { url, model } = parsePinnedOllama(selection);
    return new OllamaProvider(url, model);
  }

  // STRICT — pinned to Cloudflare Workers AI (testing backend). Only this runs.
  if (selection === 'cloudflare') {
    const cf = getCloudflareConfig();
    if (cf) return new CloudflareProvider(cf.accountId, cf.apiToken, cf.model);
  }

  // STRICT — pinned to the Litera Entra gateway (gpt-5). Only this runs.
  if (selection === 'litera') {
    const lc = await getLiteraConfig();
    if (lc) return new LiteraProvider(lc.endpoint, lc.token, lc.model);
  }

  // STRICT — pinned to Gemini via Litera's APIM gateway. Only this runs.
  if (selection === 'gemini-entra') {
    const gc = await getGeminiEntraConfig();
    if (gc) return new GeminiEntraProvider(gc.endpoint, gc.token, gc.model);
  }

  // STRICT — pinned to the hosted API. Only this runs (it self-retries rate
  // limits internally; if it still fails, the signal errors — no Ollama switch).
  if (selection === 'api' && api) {
    return apiProvider(api);
  }

  // AUTO (explicit) — fallback chain. Also the path when nothing is pinned.
  const ollamaLinks = await ollamaChain();
  const chain: Link[] = [];
  if (api) chain.push({ label: api.provider, provider: apiProvider(api) });
  chain.push(...ollamaLinks);

  if (chain.length === 0) {
    const { provider } = await selectOllama();
    return provider;
  }
  return chain.length === 1 ? chain[0].provider : new FallbackProvider(chain);
}

/**
 * Reports what the pipeline will use right now, for the settings UI. Never
 * returns the key itself.
 */
export async function getProviderStatus(): Promise<{
  provider: 'claude' | 'gemini' | 'ollama' | 'cloudflare' | 'litera' | 'gemini-entra';
  location?: 'remote' | 'local';
  model?: string;
  strict?: boolean;
}> {
  const [api, selection] = await Promise.all([getApiConfig(), getSelectedBackend()]);

  if (selection && selection.startsWith('ollama|')) {
    const { model } = parsePinnedOllama(selection);
    return { provider: 'ollama', model, strict: true };
  }
  if (selection === 'cloudflare') {
    const cf = getCloudflareConfig();
    if (cf) return { provider: 'cloudflare', model: cf.model, strict: true };
  }
  if (selection === 'litera') {
    const lc = await getLiteraConfig();
    if (lc) return { provider: 'litera', model: lc.model ?? 'gpt-5', strict: true };
  }
  if (selection === 'gemini-entra') {
    const gc = await getGeminiEntraConfig();
    if (gc) return { provider: 'gemini-entra', model: gc.model, strict: true };
  }
  if (selection === 'api' && api) return { provider: api.provider, strict: true };

  // Auto.
  if (api) return { provider: api.provider };
  const { where, model } = await selectOllama();
  return { provider: 'ollama', location: where, model };
}

export { getApiConfig, getSelectedBackend, detectProvider } from './config';
export * from './provider';
export * from './schemas';
