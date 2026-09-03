import type { GenerateStructuredParams, LLMProvider } from './provider';
import { isAvailabilityError } from './provider';

export interface FallbackLink {
  label: string;
  provider: LLMProvider;
}

/**
 * Tries each provider in order; on failure, falls through to the next.
 *
 * `onlyOnUnavailable` controls WHY it falls through, and the distinction is the
 * whole point of this class:
 *
 *   false (Auto mode) - fall through on any error. The user asked for "whatever
 *   works", so a bad answer is as good a reason to move on as a dead backend.
 *
 *   true (pinned mode) - fall through ONLY when the backend is unavailable: an
 *   expired token, an exhausted quota, a timeout. A malformed answer is a
 *   prompt or model-quality problem that another backend would likely hit too,
 *   and switching silently would hide it. Pinning still means "this model
 *   answers my requests"; it just no longer means "the feature dies when the
 *   backend is down".
 */
export class FallbackProvider implements LLMProvider {
  constructor(
    private chain: FallbackLink[],
    private onlyOnUnavailable = false
  ) {}

  async generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T> {
    let lastErr: unknown;

    for (let i = 0; i < this.chain.length; i++) {
      const link = this.chain[i];
      try {
        return await link.provider.generateStructured(params);
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);

        // In pinned mode a non-availability failure is the real answer: report
        // it rather than masking it behind a different model's output.
        if (this.onlyOnUnavailable && !isAvailabilityError(err)) {
          throw err;
        }

        const isLast = i === this.chain.length - 1;
        console.warn(
          `[llm] ${link.label} failed (${msg.slice(0, 120)})` +
            (isLast ? ' - no backends left' : ` - falling back to ${this.chain[i + 1].label}`)
        );
      }
    }

    throw lastErr ?? new Error('all providers failed');
  }
}
