/**
 * Runs `fn` over `items` with at most `limit` in flight at once. Used to pace
 * the packaging + verification calls: firing all ~10 at once overwhelms a
 * rate-limited hosted API (429s) and a single local Ollama (queue timeouts).
 * A small limit keeps both providers within capacity at the cost of some
 * wall-clock time - a worthwhile trade for reliability on free/local tiers.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
