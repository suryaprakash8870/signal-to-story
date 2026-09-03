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
 * Every backend that is configured right now, in preference order, so a pinned
 * backend has somewhere to fall through to when it is unavailable.
 *
 * Ollama is excluded: it is a local development box, and quietly answering a
 * production request from a 7B model on someone's LAN would be worse than
 * failing. Standby is limited to hosted backends of comparable quality.
 */
async function standbyLinks(
  exclude: string,
  api: { provider: 'claude' | 'gemini'; key: string } | null
): Promise<Link[]> {
  const links: Link[] = [];

  const litera = await getLiteraConfig();
  if (litera && exclude !== 'litera') {
    links.push({
      label: 'litera',
      provider: new LiteraProvider(litera.endpoint, litera.token, litera.model),
    });
  }

  const gemini = await getGeminiEntraConfig();
  if (gemini && exclude !== 'gemini-entra') {
    links.push({
      label: 'gemini-entra',
      provider: new GeminiEntraProvider(gemini.endpoint, gemini.token, gemini.model),
    });
  }

  const cf = getCloudflareConfig();
  if (cf && exclude !== 'cloudflare') {
    links.push({
      label: 'cloudflare',
      provider: new CloudflareProvider(cf.accountId, cf.apiToken, cf.model),
    });
  }

  if (api && exclude !== 'api') {
    links.push({ label: api.provider, provider: apiProvider(api) });
  }

  return links;
}

/**
 * Wraps a pinned provider so it keeps working when its backend is down.
 *
 * The pin is still honoured for every successful call: the chosen backend is
 * always tried first, and it is the only one allowed to answer a request that
 * merely came back malformed. Standby backends are reached ONLY on an
 * availability failure - an expired token, an exhausted quota, a timeout.
 *
 * This is what stops a single expired Entra token or a spent Cloudflare
 * allowance from taking the whole feature offline.
 */
async function withStandby(
  pinned: string,
  provider: LLMProvider,
  api: { provider: 'claude' | 'gemini'; key: string } | null
): Promise<LLMProvider> {
  const standby = await standbyLinks(pinned, api);
  if (standby.length === 0) return provider;
  return new FallbackProvider([{ label: pinned, provider }, ...standby], true);
}

/**
 * Resolves the provider for a pipeline call, at call time.
 *
 * PINNED selection (the default the user picks in the dropdown): the chosen
 * model answers every request. If that backend is UNAVAILABLE (401, 429,
 * timeout) the call falls through to another configured hosted backend rather
 * than failing, and the substitution is logged. A malformed answer from the
 * pinned model is still surfaced as an error, never masked.
 *
 * AUTO (only if the user explicitly picks "Auto"): the fallback chain
 * hosted API → network Ollama → local Ollama, falling through on any error.
 */
export async function getLLMProvider(): Promise<LLMProvider> {
  const [api, selection] = await Promise.all([getApiConfig(), getSelectedBackend()]);

  // STRICT - pinned to a specific Ollama endpoint+model. Only this runs.
  if (selection && selection.startsWith('ollama|')) {
    const { url, model } = parsePinnedOllama(selection);
    return new OllamaProvider(url, model);
  }

  // STRICT - pinned to Cloudflare Workers AI (testing backend). Only this runs.
  if (selection === 'cloudflare') {
    const cf = getCloudflareConfig();
    if (cf)
      return withStandby('cloudflare', new CloudflareProvider(cf.accountId, cf.apiToken, cf.model), api);
  }

  // STRICT - pinned to the Litera Entra gateway (gpt-5). Only this runs.
  if (selection === 'litera') {
    const lc = await getLiteraConfig();
    if (lc) return withStandby('litera', new LiteraProvider(lc.endpoint, lc.token, lc.model), api);
  }

  // STRICT - pinned to Gemini via Litera's APIM gateway. Only this runs.
  if (selection === 'gemini-entra') {
    const gc = await getGeminiEntraConfig();
    if (gc)
      return withStandby('gemini-entra', new GeminiEntraProvider(gc.endpoint, gc.token, gc.model), api);
  }

  // STRICT - pinned to the hosted API. Only this runs (it self-retries rate
  // limits internally; if it still fails, the signal errors - no Ollama switch).
  if (selection === 'api' && api) {
    return withStandby('api', apiProvider(api), api);
  }

  // AUTO (explicit) - fallback chain. Also the path when nothing is pinned.
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
