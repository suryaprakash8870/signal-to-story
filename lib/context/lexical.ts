// BM25 ranking of context sections, in plain code.
//
// This exists because the shortlist step needs to see section CONTENT, not just
// headings. Litera's headings are product names - "Kira", "Compare", "Office &
// Dragons" - so a model shown only headings could not tell that an update about
// contract redlining belonged with them. Matching on content fixes that.
//
// BM25 rather than embeddings for the primary path, deliberately:
//   - No API call, so no quota to exhaust and no network stall. The embedding
//     provider shares a daily allowance that the note pipeline already spends.
//   - Deterministic, so the same update always retrieves the same sections.
//   - Instant at this size. The library is ~76 sections of a few hundred words.
//
// Embeddings still win on pure synonym matching, so they are used in preference
// when vectors are present; this is the dependable floor beneath them.

/** Words carrying no retrieval signal in this domain. */
const STOP = new Set([
  'the','a','an','and','or','but','if','then','than','that','this','these','those',
  'is','are','was','were','be','been','being','to','of','in','on','for','with','as',
  'at','by','from','into','about','it','its','their','they','we','our','us','you',
  'has','have','had','will','would','can','could','may','might','should','not','no',
  'new','also','more','most','other','which','who','what','when','where','how','all',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    // Crude suffix trim so "drafting"/"drafts"/"draft" match each other. Good
    // enough for retrieval, where recall matters more than linguistic purity.
    .map((w) => w.replace(/(ing|ed|es|s)$/, ''))
    .filter((w) => w.length > 2);
}

export interface LexicalDoc {
  id: string;
  text: string;
}

export interface LexicalHit {
  id: string;
  score: number;
}

// Standard BM25 constants: k1 controls term-frequency saturation, b controls
// how much document length is penalised.
const K1 = 1.5;
const B = 0.75;

/**
 * Ranks documents against a query, best first. Only documents sharing at least
 * one meaningful term are returned, so an unrelated update yields nothing
 * rather than the least-bad match.
 */
export function rankLexically(query: string, docs: LexicalDoc[], limit: number): LexicalHit[] {
  if (docs.length === 0) return [];

  const tokenized = docs.map((d) => ({ id: d.id, terms: tokenize(d.text) }));
  const avgLen = tokenized.reduce((sum, d) => sum + d.terms.length, 0) / tokenized.length || 1;

  // Document frequency per term.
  const df = new Map<string, number>();
  for (const doc of tokenized) {
    for (const term of new Set(doc.terms)) df.set(term, (df.get(term) ?? 0) + 1);
  }

  const queryTerms = [...new Set(tokenize(query))];
  const N = tokenized.length;

  const scored = tokenized.map((doc) => {
    const freq = new Map<string, number>();
    for (const term of doc.terms) freq.set(term, (freq.get(term) ?? 0) + 1);

    let score = 0;
    for (const term of queryTerms) {
      const f = freq.get(term);
      if (!f) continue;
      const n = df.get(term) ?? 0;
      // BM25 inverse document frequency, +1 inside the log so common terms
      // score low rather than negative.
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + B * (doc.terms.length / avgLen))));
    }
    return { id: doc.id, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
