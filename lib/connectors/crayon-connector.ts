import type { Connector, RawSignalCandidate } from './connector';
import { loadFixture } from './fixtures';
import { fetchWithBackoff } from './backoff';

// Live-mode credentials. The Crayon Platform API authenticates with an
// `X-API-KEY` header (NOT a Bearer token) against https://app.crayon.co.
// The key may be stored in Vault (entered on the Connectors page) or fall back
// to the CRAYON_API_KEY env var.
export interface CrayonCredentials {
  base_url?: string; // default https://app.crayon.co
  api_key?: string; // the X-API-KEY value
  live_tiles_only?: boolean; // default true — only Sparks published as Battlecard Live Tiles
  per_page?: number; // cap Sparks per poll (endpoint returns ALL — up to 200+ — without this)
}

const DEFAULT_BASE = 'https://app.crayon.co';
const DEFAULT_PER_PAGE = 5;

// Inbound. Test Mode reads crayon_sample.json; Live Mode pulls Crayon "Sparks"
// (competitive-intelligence briefings from the last 30 days) via GET
// /papi/sparks/. Each Spark becomes one signal. Polled once a day
// (.github/workflows/crayon-poll.yml); dedup on raw_text_hash means re-seeing an
// old Spark in the rolling 30-day window never creates a duplicate.
export class CrayonConnector implements Connector {
  type = 'crayon' as const;
  direction = 'inbound' as const;

  constructor(private mode: 'test' | 'live', private creds?: CrayonCredentials) {}

  private apiKey(): string | undefined {
    return this.creds?.api_key ?? process.env.CRAYON_API_KEY;
  }

  private sparksUrl(): string {
    const base = this.creds?.base_url ?? DEFAULT_BASE;
    const liveTiles = this.creds?.live_tiles_only ?? true;
    // page + per_page MUST be sent together to cap the result — otherwise the
    // endpoint returns the entire rolling 30-day window (200+ Sparks).
    const perPage = this.creds?.per_page ?? DEFAULT_PER_PAGE;
    return `${base}/papi/sparks/?live_tiles_only=${liveTiles}&page=1&per_page=${perPage}`;
  }

  async testConnection() {
    if (this.mode === 'test') {
      return { ok: true, message: 'Running in Test Mode against fixture data.' };
    }
    const key = this.apiKey();
    if (!key) return { ok: false, message: 'Live Mode needs a Crayon API key (X-API-KEY).' };
    const base = this.creds?.base_url ?? DEFAULT_BASE;
    const res = await fetchWithBackoff(`${base}/papi/sparks/?live_tiles_only=true&per_page=1`, {
      headers: { 'X-API-KEY': key, Accept: 'application/json' },
    });
    return res.ok
      ? { ok: true, message: 'Crayon API authenticated.' }
      : { ok: false, message: `Crayon returned ${res.status}.` };
  }

  async fetch(): Promise<RawSignalCandidate[]> {
    if (this.mode === 'test') {
      const fx = loadFixture('crayon_sample.json');
      return [{ raw_text: fx.raw_text, source_type: 'crayon', source_ref: fx.source_ref }];
    }
    const key = this.apiKey();
    if (!key) throw new Error('Crayon Live Mode requires an API key (X-API-KEY).');

    const res = await fetchWithBackoff(this.sparksUrl(), {
      headers: { 'X-API-KEY': key, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Crayon sparks query failed: ${res.status}`);
    const data = await res.json();

    // The endpoint returns a top-level array of Sparks.
    const sparks: Record<string, unknown>[] = Array.isArray(data)
      ? data
      : ((data.sparks ?? data.results ?? []) as Record<string, unknown>[]);

    return sparks.map((s) => mapCrayonSpark(s));
  }
}

// Strips Crayon's footnote citations from a Spark's markdown so only the signal
// text remains. Crayon appends numbered footnote markers (`[^1]`) inline and
// their link definitions (`[^1]: https://app.crayon.co/insight/...`) at the end;
// we don't surface those source links, so remove both plus any bare insight URLs.
// Parses Crayon's footnote citation links out of a Spark's markdown BEFORE they
// are stripped, so a reviewer can open the underlying source in one click. Shape:
// [{ ref: "1", url: "https://app.crayon.co/insight/..." }]. Deduped by URL.
export function extractCrayonSourceLinks(text: string): { ref: string; url: string }[] {
  const links: { ref: string; url: string }[] = [];
  const seen = new Set<string>();
  const re = /^\s*\[\^([^\]]+)\]:\s*(https?:\/\/\S+)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const url = m[2].replace(/[).,]+$/, ''); // trim trailing punctuation
    if (!seen.has(url)) {
      seen.add(url);
      links.push({ ref: m[1], url });
    }
  }
  return links;
}

function stripCrayonCitations(text: string): string {
  return text
    .replace(/^\s*\[\^[^\]]+\]:.*$/gm, '') // footnote definition lines
    .replace(/\[\^[^\]]+\]/g, '') // inline [^n] markers
    .replace(/https?:\/\/app\.crayon\.co\/\S+/g, '') // stray insight URLs
    .replace(/\n{3,}/g, '\n\n') // collapse blank lines the removals leave behind
    .trim();
}

// Turns one Crayon Spark into a raw signal. The Spark's title + content (a
// markdown competitive briefing) is the raw signal text; the competitor name is
// prepended so the pipeline's classification has it. Shared with the webhook
// receiver so both produce identical signals.
export function mapCrayonSpark(spark: Record<string, unknown>): RawSignalCandidate {
  const title = (spark.title ?? '') as string;
  // Prefer the Spark briefing fields; fall back to webhook/alert field names.
  const rawContent = (spark.content ?? spark.changes_section ?? spark.summary ?? spark.description ?? '') as string;
  const source_links = extractCrayonSourceLinks(rawContent);
  const content = stripCrayonCitations(rawContent);
  const competitors = (spark.competitors ?? []) as { name?: string }[];
  const competitor =
    competitors[0]?.name ?? (spark.competitor as string) ?? (spark.competitorName as string) ?? '';

  const raw_text =
    [competitor && `Competitor: ${competitor}`, title, content]
      .filter(Boolean)
      .join('\n\n') || 'Crayon Spark flagged for review.';

  return {
    raw_text,
    source_type: 'crayon',
    source_ref: String(spark.url ?? spark.automated_spark_id ?? spark.id ?? spark.alert_id ?? ''),
    ...(source_links.length ? { source_links } : {}),
  };
}
