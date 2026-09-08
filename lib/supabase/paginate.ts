// Reads every row matching a query, not just the first thousand.
//
// Supabase caps any single response at 1,000 rows and does so silently: the
// request succeeds, `error` is null, and the caller has no way to tell a
// complete answer from a truncated one. `.limit(5000)` does not lift it either,
// because the ceiling is enforced by the server.
//
// That silence caused two real defects. The competitor rail counted whichever
// thousand rows came back, so Avvoka showed 9 updates against 42 actually held.
// Note generation only ever saw the same thousand, so several hundred updates
// could never be picked up no matter how often a refresh ran.
//
// Anything reading a whole table should go through here.

/** The server-side ceiling. Pages are requested at exactly this size. */
export const PAGE_SIZE = 1000;

interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Calls `page` with successive ranges until a short page comes back.
 *
 * The query built inside `page` MUST have a deterministic order, including a
 * tiebreak on a unique column. Paging an unordered or ambiguously ordered query
 * can return the same row twice and skip another.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  context = 'query'
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${context}: ${error.message}`);
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  return rows;
}
