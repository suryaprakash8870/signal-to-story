import type { GenerateStructuredParams, LLMProvider } from './provider';
import { stripCodeFences } from './provider';

// Litera's internal Azure/Entra OpenAI-compatible gateway (currently gpt-5).
// Standard OpenAI chat/completions shape: POST { messages }, read
// choices[0].message.content. Auth is a Bearer token (an Entra/Azure AD JWT).
//
// IMPORTANT: the Entra token expires (~1 hour). A static token in env/Vault
// will stop working after that. For production this needs a token-refresh flow
// (client-credentials or device-code against Entra) rather than a pasted token.
export class LiteraProvider implements LLMProvider {
  constructor(
    private endpoint: string,
    private token: string,
    private model?: string
  ) {}

  async generateStructured<T>({
    systemPrompt,
    userPrompt,
    schema,
  }: GenerateStructuredParams<T>): Promise<T> {
    const payload: Record<string, unknown> = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    };
    // No `temperature` here on purpose: gpt-5 accepts only its default and
    // returns 400 for any explicit value, so the pipeline-wide
    // PIPELINE_TEMPERATURE cannot be applied to this gateway. Output from
    // this backend is therefore less repeatable than the others, which is
    // why generated notes are cached by input hash rather than regenerated.
    //
    // The gateway pins the deployment, so `model` is optional; include it when
    // configured so a specific deployment can be targeted.
    if (this.model) payload.model = this.model;
    const body = JSON.stringify(payload);

    const maxAttempts = 4;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await fetch(this.endpoint, {
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
            `Litera API returned no content: ${JSON.stringify(data).slice(0, 300)}`
          );
        }
        const parsed = JSON.parse(stripCodeFences(content));
        return schema.parse(parsed);
      }

      // Rate limit / transient server error → back off and retry.
      if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts - 1) {
        const wait = Math.min(2000 * 2 ** attempt, 20_000);
        console.warn(
          `[litera] ${res.status}, waiting ${Math.round(wait / 1000)}s then retrying (attempt ${attempt + 1}/${maxAttempts})`
        );
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      const errBody = await res.text().catch(() => '');
      // 401 almost always means the Entra token has expired.
      if (res.status === 401) {
        throw new Error(
          `Litera API 401 - the access token is invalid or expired. Entra tokens last ~1 hour; refresh the token. ${errBody.slice(0, 200)}`
        );
      }
      throw new Error(`Litera API request failed: ${res.status} ${errBody.slice(0, 300)}`);
    }
    throw new Error('Litera API request failed: exhausted retries');
  }
}
