import type { GenerateStructuredParams, LLMProvider } from './provider';
import { stripCodeFences, PIPELINE_TEMPERATURE } from './provider';

// Google Gemini via the Generative Language REST API — no SDK needed.
// responseMimeType: application/json forces raw JSON output, same contract
// as the other providers. On free-tier rate limits (429) the call waits and
// retries rather than failing — the pipeline makes several calls in a row and
// the free tier is ~10/min, so brief waits are expected, not errors.
export class GeminiProvider implements LLMProvider {
  constructor(private apiKey: string) {}

  async generateStructured<T>({
    systemPrompt,
    userPrompt,
    schema,
  }: GenerateStructuredParams<T>): Promise<T> {
    const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const body = JSON.stringify({
      contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: PIPELINE_TEMPERATURE,
        maxOutputTokens: 1500,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body,
        signal: AbortSignal.timeout(60_000),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        const parsed = JSON.parse(stripCodeFences(text));
        return schema.parse(parsed);
      }

      // Rate limit or transient server error → wait and retry.
      if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts - 1) {
        const errText = await res.text().catch(() => '');
        const wait = retryDelayMs(errText, attempt);
        console.warn(`[gemini] ${res.status}, waiting ${Math.round(wait / 1000)}s then retrying (attempt ${attempt + 1}/${maxAttempts})`);
        await sleep(wait);
        continue;
      }

      const errBody = await res.text().catch(() => '');
      throw new Error(`Gemini request failed: ${res.status} ${errBody.slice(0, 300)}`);
    }
    throw new Error('Gemini request failed: exhausted retries');
  }
}

// Prefer the server's suggested RetryInfo delay if present, else exponential
// backoff. Free-tier per-minute quota resets within ~60s, so cap waits there.
function retryDelayMs(errText: string, attempt: number): number {
  const m = errText.match(/"retryDelay"\s*:\s*"(\d+)s"/);
  if (m) return Math.min(Number(m[1]) * 1000 + 500, 65_000);
  return Math.min(2000 * 2 ** attempt, 30_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
