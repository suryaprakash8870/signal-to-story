import { supabaseServiceRole } from '../supabase/server';

// Vector search over the context library.
//
// The shortlist step used to ask a model which sections were relevant, showing
// it only the section HEADINGS. Litera's headings are product names - "Kira",
// "Office & Dragons", "Litera One" - which say nothing about what the section
// covers, so the model could not judge relevance and grounding recall suffered.
//
// Embeddings are computed over section CONTENT, so a competitor update about
// contract redlining matches the Kira section on what it actually says. That
// removes a model call per note AND improves recall, which is why this replaces
// the shortlist rather than sitting in front of it.

/** Cloudflare's embedding model. 768 dimensions, and free at our volume. */
const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';

/** How many sections to hand to the note writer. */
export const SHORTLIST_SIZE = 5;

/**
 * Below this cosine similarity a section is not worth passing on. Set low
 * deliberately: the note writer and the verify step both judge relevance again,
 * so the cost of one weak candidate is small, while missing the only relevant
 * section cannot be recovered downstream.
 */
const MIN_SIMILARITY = 0.35;

export interface EmbeddingResult {
  vectors: number[][];
  model: string;
}

/**
 * Embeds a batch of texts. Returns null when Cloudflare is not configured, so
 * callers fall back to the model shortlist rather than failing.
 */
export async function embed(texts: string[]): Promise<EmbeddingResult | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken || texts.length === 0) return null;

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${EMBEDDING_MODEL}`;

  // The endpoint caps how much it will embed in one request, so send in chunks.
  const CHUNK = 50;
  const vectors: number[][] = [];

  for (let i = 0; i < texts.length; i += CHUNK) {
    const chunk = texts.slice(i, i + CHUNK).map((t) => t.slice(0, 2000));
    let lastErr = '';

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiToken}` },
          body: JSON.stringify({ text: chunk }),
          signal: AbortSignal.timeout(60_000),
        });
        if (res.ok) {
          const json = await res.json();
          const data = json?.result?.data as number[][] | undefined;
          if (!Array.isArray(data) || data.length !== chunk.length) {
            throw new Error(`unexpected embedding shape (${data?.length ?? 'none'} of ${chunk.length})`);
          }
          vectors.push(...data);
          lastErr = '';
          break;
        }
        lastErr = `${res.status} ${(await res.text().catch(() => '')).slice(0, 120)}`;
        if (res.status === 429 || res.status >= 500) {
          await new Promise((r) => setTimeout(r, Math.min(2000 * 2 ** attempt, 10_000)));
          continue;
        }
        break;
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
      }
    }

    if (lastErr) {
      console.warn(`[embeddings] batch failed (${lastErr.slice(0, 140)})`);
      return null;
    }
  }

  return { vectors, model: EMBEDDING_MODEL };
}

/** Cosine similarity. Both vectors come from the same model, so same length. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Computes and stores embeddings for every context section that lacks one.
 * Safe to re-run: only missing rows are embedded.
 */
export async function backfillSectionEmbeddings(): Promise<{
  embedded: number;
  skipped: number;
  error?: string;
}> {
  const db = supabaseServiceRole();
  const { data, error } = await db
    .from('context_sections')
    .select('id, heading, content')
    .is('embedding', null);
  if (error) return { embedded: 0, skipped: 0, error: error.message };

  const rows = (data ?? []) as { id: string; heading: string; content: string }[];
  if (rows.length === 0) return { embedded: 0, skipped: 0 };

  // Heading and content together: the heading is often a product name that
  // carries real meaning once paired with what the section says about it.
  const result = await embed(rows.map((r) => `${r.heading}\n\n${r.content}`));
  if (!result) return { embedded: 0, skipped: rows.length, error: 'embedding provider unavailable' };

  let embedded = 0;
  for (let i = 0; i < rows.length; i++) {
    const { error: writeErr } = await db
      .from('context_sections')
      .update({ embedding: result.vectors[i], embedding_model: result.model })
      .eq('id', rows[i].id);
    if (!writeErr) embedded++;
  }

  return { embedded, skipped: rows.length - embedded };
}

export interface ScoredSection {
  id: string;
  similarity: number;
}

/**
 * Ranks stored sections against a piece of text. Returns null when embeddings
 * are unavailable (none stored, or the provider is down), which tells the
 * caller to fall back to asking a model.
 */
export async function rankSectionsByEmbedding(
  text: string,
  limit = SHORTLIST_SIZE
): Promise<ScoredSection[] | null> {
  const db = supabaseServiceRole();
  const { data, error } = await db
    .from('context_sections')
    .select('id, embedding')
    .not('embedding', 'is', null);
  if (error) return null;

  const rows = (data ?? []) as unknown as { id: string; embedding: number[] }[];
  if (rows.length === 0) return null;

  const queryResult = await embed([text]);
  if (!queryResult || queryResult.vectors.length === 0) return null;
  const query = queryResult.vectors[0];

  return rows
    .map((r) => ({ id: r.id, similarity: cosine(query, r.embedding) }))
    .filter((r) => r.similarity >= MIN_SIMILARITY)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
