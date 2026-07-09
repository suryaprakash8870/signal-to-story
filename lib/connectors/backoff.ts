/**
 * Exponential backoff with retry on 429/5xx, per 10-OPTIMIZATION-NOTES.md
 * ("Rate-limit and back off on 429s from any vendor API — implement
 * exponential backoff, not just a single retry"). Used by every live-mode
 * connector's fetch()/push().
 */
export async function fetchWithBackoff(
  url: string,
  init: RequestInit = {},
  opts: { retries?: number; baseDelayMs?: number } = {}
): Promise<Response> {
  const retries = opts.retries ?? 4;
  const base = opts.baseDelayMs ?? 500;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status !== 429 && res.status < 500) return res;
      // Honor Retry-After when the server sends it, else exponential backoff.
      const retryAfter = Number(res.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : base * 2 ** attempt;
      if (attempt === retries) return res; // out of retries — return the bad response
      await sleep(delay);
    } catch (err) {
      lastErr = err;
      if (attempt === retries) throw err;
      await sleep(base * 2 ** attempt);
    }
  }
  throw lastErr ?? new Error('fetchWithBackoff: exhausted retries');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
