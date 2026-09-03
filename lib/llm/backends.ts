// Enumerates the models a user can pin the pipeline to, for the settings
// dropdown: the hosted API (if a key is set) plus every model on each reachable
// Ollama endpoint. Endpoints are read from env (the Mac on the WiFi and the
// local box). Queries run server-side, so LAN endpoints the browser can't
// reach are still listed as long as the app server can reach them.

import { getCloudflareConfig, getLiteraConfig, getGeminiEntraConfig } from './config';

export interface OllamaEndpoint {
  name: string;
  url: string;
}

export function ollamaEndpoints(): OllamaEndpoint[] {
  const local = process.env.OLLAMA_LOCAL_URL ?? 'http://localhost:11434';
  const remote = process.env.OLLAMA_REMOTE_URL ?? process.env.OLLAMA_BASE_URL ?? '';
  const eps: OllamaEndpoint[] = [];
  if (remote && remote !== local) eps.push({ name: 'network', url: remote });
  eps.push({ name: 'local', url: local });
  return eps;
}

export interface Backend {
  id: string; // 'auto' | 'api' | 'ollama|<url>|<model>'
  label: string;
  kind: 'auto' | 'api' | 'ollama';
  reachable?: boolean;
}

/**
 * Lists selectable backends for the dropdown. `apiProvider` is the detected
 * hosted provider ('claude' | 'gemini') or null. Unreachable Ollama endpoints
 * are simply skipped so the list only offers models that can actually run.
 */
export async function listBackends(apiProvider: string | null): Promise<Backend[]> {
  const backends: Backend[] = [
    { id: 'auto', label: 'Auto - API, then network, then local', kind: 'auto' },
  ];
  if (apiProvider) {
    const model = apiProvider === 'gemini' ? process.env.GEMINI_MODEL ?? 'gemini-2.5-flash' : process.env.CLAUDE_MODEL ?? 'claude';
    backends.push({ id: 'api', label: `${apiProvider} - ${model}`, kind: 'api' });
  }

  const cf = getCloudflareConfig();
  if (cf) {
    backends.push({ id: 'cloudflare', label: `Cloudflare - ${cf.model}`, kind: 'api' });
  }

  const litera = await getLiteraConfig();
  if (litera) {
    backends.push({ id: 'litera', label: `Litera - ${litera.model ?? 'gpt-5'}`, kind: 'api' });
  }

  const gemini = await getGeminiEntraConfig();
  if (gemini) {
    backends.push({
      id: 'gemini-entra',
      label: `Litera - Gemini (${gemini.model})`,
      kind: 'api',
    });
  }

  for (const ep of ollamaEndpoints()) {
    try {
      const res = await fetch(`${ep.url}/api/tags`, { signal: AbortSignal.timeout(3500) });
      if (!res.ok) continue;
      const data = await res.json();
      for (const m of data.models ?? []) {
        backends.push({
          id: `ollama|${ep.url}|${m.name}`,
          label: `Ollama ${ep.name} - ${m.name}`,
          kind: 'ollama',
          reachable: true,
        });
      }
    } catch {
      // endpoint unreachable from the server - skip it
    }
  }
  return backends;
}
