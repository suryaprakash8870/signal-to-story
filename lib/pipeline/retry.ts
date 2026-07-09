/**
 * Retry a structured-generation call once with the validation error appended
 * to the prompt, per the shared rule in 02-PIPELINE-STAGES.md. Callers pass
 * the failure back into their own prompt-builder via `buildRetryPrompt`.
 */
export async function withOneRetry<T>(
  attempt: (extraContext?: string) => Promise<T>
): Promise<T> {
  try {
    return await attempt();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return attempt(
      `Your previous response failed validation with this error: ${message}. ` +
        `Return only a single valid JSON object matching the schema. No preamble, no markdown code fences.`
    );
  }
}
