import type { LLMProvider } from './provider';
import { OllamaProvider } from './ollama-provider';

// Remote is preferred (the LAN box with the RAM for a bigger model); local is
// the fallback when the remote box is offline. Both configurable; sensible
// defaults if unset. Backward-compatible with the older single OLLAMA_BASE_URL.
function remoteUrl() {
  return process.env.OLLAMA_REMOTE_URL ?? process.env.OLLAMA_BASE_URL ?? '';
}
function remoteModel() {
  return process.env.OLLAMA_REMOTE_MODEL ?? process.env.OLLAMA_MODEL ?? 'qwen2.5:14b';
}
function localUrl() {
  return process.env.OLLAMA_LOCAL_URL ?? 'http://localhost:11434';
}
function localModel() {
  return process.env.OLLAMA_LOCAL_MODEL ?? 'qwen2.5:7b';
}

// Cache the remote reachability check so we don't ping it on every pipeline
// call. Short window so we notice the box coming up/going down quickly. Note:
// staleness here is non-fatal — the fallback chain still ends in local Ollama,
// so a wrongly-"up" remote just fails over one link.
let remoteCache: { ok: boolean; at: number } | null = null;
const CACHE_MS = 30_000;

async function isRemoteUp(url: string): Promise<boolean> {
  if (!url) return false;
  if (remoteCache && Date.now() - remoteCache.at < CACHE_MS) return remoteCache.ok;
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(2500) });
    remoteCache = { ok: res.ok, at: Date.now() };
    return res.ok;
  } catch {
    remoteCache = { ok: false, at: Date.now() };
    return false;
  }
}

export interface OllamaChoice {
  provider: OllamaProvider;
  where: 'remote' | 'local';
  url: string;
  model: string;
}

/**
 * The single best Ollama choice (remote if reachable, else local) — used for
 * status display.
 */
export async function selectOllama(): Promise<OllamaChoice> {
  const rUrl = remoteUrl();
  if (rUrl && rUrl !== localUrl() && (await isRemoteUp(rUrl))) {
    return { provider: new OllamaProvider(rUrl, remoteModel()), where: 'remote', url: rUrl, model: remoteModel() };
  }
  return { provider: new OllamaProvider(localUrl(), localModel()), where: 'local', url: localUrl(), model: localModel() };
}

/**
 * Ordered fallback links for Ollama: remote first (only if configured and its
 * reachability check passes, to avoid a hang), then local as the always-present
 * final fallback. The caller chains these after any hosted API provider, so a
 * failure cascades API → remote → local.
 */
export async function ollamaChain(): Promise<{ label: string; provider: LLMProvider }[]> {
  const links: { label: string; provider: LLMProvider }[] = [];
  const rUrl = remoteUrl();
  if (rUrl && rUrl !== localUrl() && (await isRemoteUp(rUrl))) {
    links.push({
      label: `ollama-remote (${remoteModel()})`,
      provider: new OllamaProvider(rUrl, remoteModel()),
    });
  }
  links.push({
    label: `ollama-local (${localModel()})`,
    provider: new OllamaProvider(localUrl(), localModel()),
  });
  return links;
}
