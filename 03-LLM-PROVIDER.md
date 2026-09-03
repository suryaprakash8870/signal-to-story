# 03 - LLM Provider (Claude API + Local Ollama)

Two providers, one interface, selected by a config flag. Never call
Ollama's or Anthropic's SDK directly from pipeline code - always go
through this interface, so switching providers is a one-line environment
change, never a code change.

## Interface

```typescript
// lib/llm/provider.ts

export interface LLMProvider {
  generateStructured<T>(params: {
    systemPrompt: string;
    userPrompt: string;
    schema: ZodSchema<T>; // validated on every call, regardless of provider
  }): Promise<T>;
}
```

## Claude provider (production)

```typescript
// lib/llm/claude-provider.ts
import Anthropic from "@anthropic-ai/sdk";

export class ClaudeProvider implements LLMProvider {
  private client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  async generateStructured<T>({ systemPrompt, userPrompt, schema }) {
    const response = await this.client.messages.create({
      model: process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6",
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = response.content.find(b => b.type === "text")?.text ?? "";
    const parsed = JSON.parse(stripCodeFences(text));
    return schema.parse(parsed); // throws on schema mismatch - caller retries
  }
}
```

## Ollama provider (dev/test only)

```typescript
// lib/llm/ollama-provider.ts

export class OllamaProvider implements LLMProvider {
  private baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

  async generateStructured<T>({ systemPrompt, userPrompt, schema }) {
    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL ?? "llama3.1:8b",
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        format: "json",
        stream: false,
      }),
    });
    const data = await res.json();
    const parsed = JSON.parse(data.response);
    return schema.parse(parsed);
  }
}
```

`OLLAMA_BASE_URL` is deliberately configurable, not hardcoded to
`localhost` - the current setup runs Ollama on a separate machine from the
developer's laptop, which this supports directly. That machine must be
reachable only from trusted machines on a private network: Ollama's API
has no built-in authentication, so if that machine is ever exposed to a
public or shared network, put it behind a firewall rule scoped to known
IPs or a VPN, not an open port.

## Selecting the provider

```typescript
// lib/llm/index.ts
export const llmProvider: LLMProvider =
  process.env.LLM_PROVIDER === "claude"
    ? new ClaudeProvider()
    : new OllamaProvider();
```

## Hard rule - enforce in code, not just documentation

Add a guard so this can't be silently misconfigured:

```typescript
// Call this before any Stage 5 (Output Packaging) call that will be
// shown to a human reviewer for real publication, not a test run.
export function assertProductionSafe() {
  if (process.env.LLM_PROVIDER !== "claude" && process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to run production pipeline on a non-Claude provider. " +
      "Set LLM_PROVIDER=claude before deploying."
    );
  }
}
```

## What Ollama testing does and does not validate

- **Validates:** the pipeline fires correctly, JSON parses, data writes to
  the right tables, the UI renders it, the review queue works.
- **Does not validate:** whether the grounding rule (fact vs. inference,
  see `02-PIPELINE-STAGES.md`) actually holds up. Local models are
  measurably weaker at this specific instruction-following task. Before
  trusting any real output, re-run the fixture set in
  `08-TEST-FIXTURES-AND-TESTING.md` against Claude specifically and check
  that `unverified_claims` populates correctly on the fixture designed to
  trigger it.
