import type { GenerateStructuredParams, LLMProvider } from './provider';

/**
 * Tries each provider in order; on failure, falls through to the next. This is
 * what makes "hosted API when available, otherwise local model" hold at call
 * time — if the API provider genuinely fails (after its own internal retries),
 * the signal continues on Ollama instead of dying. The API provider is
 * responsible for waiting out its own rate limits (see gemini-provider.ts), so
 * a 429 typically never reaches here.
 */
export class FallbackProvider implements LLMProvider {
  constructor(private chain: { label: string; provider: LLMProvider }[]) {}

  async generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T> {
    let lastErr: unknown;
    for (const link of this.chain) {
      try {
        return await link.provider.generateStructured(params);
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[llm] ${link.label} failed (${msg.slice(0, 120)}) — falling back`);
      }
    }
    throw lastErr ?? new Error('all providers failed');
  }
}
