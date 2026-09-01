import Anthropic from '@anthropic-ai/sdk';
import type { GenerateStructuredParams, LLMProvider } from './provider';
import { stripCodeFences, PIPELINE_TEMPERATURE } from './provider';

export class ClaudeProvider implements LLMProvider {
  private client: Anthropic;

  // Key may come from Vault (added via the website) or the env fallback.
  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY });
  }

  async generateStructured<T>({
    systemPrompt,
    userPrompt,
    schema,
  }: GenerateStructuredParams<T>): Promise<T> {
    const response = await this.client.messages.create({
      model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 1500,
      temperature: PIPELINE_TEMPERATURE,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const block = response.content.find((b) => b.type === 'text');
    const text = block && 'text' in block ? block.text : '';
    const parsed = JSON.parse(stripCodeFences(text));
    return schema.parse(parsed);
  }
}
