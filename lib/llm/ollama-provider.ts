import type { GenerateStructuredParams, LLMProvider } from './provider';
import { stripCodeFences, PIPELINE_TEMPERATURE } from './provider';

export class OllamaProvider implements LLMProvider {
  private baseUrl: string;
  private model: string;

  // baseUrl/model are chosen by the selector (remote vs local); env values
  // are only a last-resort fallback for direct construction.
  constructor(baseUrl?: string, model?: string) {
    this.baseUrl = baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    this.model = model ?? process.env.OLLAMA_MODEL ?? 'qwen2.5:7b';
  }

  async generateStructured<T>({
    systemPrompt,
    userPrompt,
    schema,
  }: GenerateStructuredParams<T>): Promise<T> {
    const where = `${this.model} on ${this.baseUrl}`;
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        body: JSON.stringify({
          model: this.model,
          prompt: `${systemPrompt}\n\n${userPrompt}`,
          format: 'json',
          stream: false,
          options: { temperature: PIPELINE_TEMPERATURE },
        }),
        // Cap the wait so a hung/very slow box surfaces a clear error rather
        // than blocking the pipeline forever. Generous for a slow 14B run.
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Ollama unreachable — could not reach ${where} (${reason})`);
    }
    if (!res.ok) {
      throw new Error(`Ollama error from ${where}: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    const parsed = JSON.parse(stripCodeFences(data.response));
    return schema.parse(parsed);
  }
}
