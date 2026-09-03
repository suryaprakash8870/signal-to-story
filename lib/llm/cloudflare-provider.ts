import type { GenerateStructuredParams, LLMProvider } from './provider';
import { stripCodeFences, PIPELINE_TEMPERATURE } from './provider';

// Cloudflare Workers AI (hosted, OpenAI-style chat completion). Used as a
// free/low-cost testing backend. A 32B coder-tuned model follows strict JSON
// shape far more reliably than the small local Ollama models, which fixes the
// "missing required field" classification failures.
//
// Creds come from env (CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN) - fine for
// testing. For production the token should move into Vault like the other keys.
export class CloudflareProvider implements LLMProvider {
  constructor(
    private accountId: string,
    private apiToken: string,
    private model: string
  ) {}

  async generateStructured<T>({
    systemPrompt,
    userPrompt,
    schema,
  }: GenerateStructuredParams<T>): Promise<T> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`;
    const body = JSON.stringify({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1500,
      temperature: PIPELINE_TEMPERATURE,
    });

    const maxAttempts = 4;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiToken}`,
        },
        body,
        signal: AbortSignal.timeout(90_000),
      });

      if (res.ok) {
        const data = await res.json();
        const resp = data?.result?.response;
        if (resp == null) {
          throw new Error(
            `Cloudflare Workers AI returned no response: ${JSON.stringify(data).slice(0, 300)}`
          );
        }
        // Workers AI returns `response` as an already-parsed object when the
        // model emits clean JSON, or as a raw string otherwise.
        const parsed = typeof resp === 'string' ? JSON.parse(stripCodeFences(resp)) : resp;
        return schema.parse(parsed);
      }

      // Rate limit / transient server error → back off and retry.
      if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts - 1) {
        const wait = Math.min(2000 * 2 ** attempt, 20_000);
        console.warn(
          `[cloudflare] ${res.status}, waiting ${Math.round(wait / 1000)}s then retrying (attempt ${attempt + 1}/${maxAttempts})`
        );
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      const errBody = await res.text().catch(() => '');
      throw new Error(
        `Cloudflare Workers AI request failed: ${res.status} ${errBody.slice(0, 300)}`
      );
    }
    throw new Error('Cloudflare Workers AI request failed: exhausted retries');
  }
}
