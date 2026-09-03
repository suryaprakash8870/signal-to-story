import type { GenerateStructuredParams, LLMProvider } from './provider';
import { stripCodeFences, PIPELINE_TEMPERATURE } from './provider';

// Google Gemini via Litera's Azure APIM gateway (the gemini-entra path).
//
// Same Entra token and audience as the GPT-5 gateway, so no separate
// credentials are needed. OpenAI-compatible request and response shape; the
// model is selected with a ?model= query parameter rather than a body field,
// and APIM maps it to the corresponding Vertex AI model.
//
// Note: the documented 'gemini-flash' option is not currently enabled on this
// gateway (it returns InvalidModel), so 'gemini-pro' is the working choice.
export class GeminiEntraProvider implements LLMProvider {
  constructor(
    private endpoint: string,
    private token: string,
    /** Query-parameter model name, e.g. 'gemini-pro'. */
    private model: string
  ) {}

  private url(): string {
    const sep = this.endpoint.includes('?') ? '&' : '?';
    return `${this.endpoint}${sep}model=${encodeURIComponent(this.model)}`;
  }

  async generateStructured<T>({
    systemPrompt,
    userPrompt,
    schema,
  }: GenerateStructuredParams<T>): Promise<T> {
    const body = JSON.stringify({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: PIPELINE_TEMPERATURE,
    });

    const maxAttempts = 4;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await fetch(this.url(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body,
        signal: AbortSignal.timeout(120_000),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content;
        if (content == null) {
          throw new Error(
            `Gemini returned no content: ${JSON.stringify(data).slice(0, 300)}`
          );
        }
        return schema.parse(JSON.parse(stripCodeFences(content)));
      }

      // Rate limit or transient server error: back off and retry.
      if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts - 1) {
        const wait = Math.min(2000 * 2 ** attempt, 20_000);
        console.warn(
          `[gemini] ${res.status}, waiting ${Math.round(wait / 1000)}s then retrying (attempt ${attempt + 1}/${maxAttempts})`
        );
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      const errBody = await res.text().catch(() => '');
      if (res.status === 401) {
        throw new Error(
          `Gemini API 401 - the access token is invalid or expired. Entra tokens last ~1 hour; refresh the token. ${errBody.slice(0, 200)}`
        );
      }
      throw new Error(`Gemini API request failed: ${res.status} ${errBody.slice(0, 300)}`);
    }
    throw new Error('Gemini API request failed: exhausted retries');
  }
}
