import type { Connector, RawSignalCandidate } from './connector';
import { loadFixture } from './fixtures';
import { fetchWithBackoff } from './backoff';

// Live-mode credentials, stored as JSON in Vault. Gong uses Basic auth with
// an access key + secret.
export interface GongCredentials {
  base_url?: string; // default https://api.gong.io
  access_key: string;
  access_key_secret: string;
}

// Inbound. Test Mode reads gong_sample.json; Live Mode queries Gong's Calls +
// Transcript API. Live access depends on Litera's plan tier (Phase 2 gate).
export class GongConnector implements Connector {
  type = 'gong' as const;
  direction = 'inbound' as const;

  constructor(private mode: 'test' | 'live', private creds?: GongCredentials) {}

  private authHeader() {
    const token = Buffer.from(`${this.creds!.access_key}:${this.creds!.access_key_secret}`).toString('base64');
    return `Basic ${token}`;
  }

  async testConnection() {
    if (this.mode === 'test') {
      return { ok: true, message: 'Running in Test Mode against fixture data.' };
    }
    if (!this.creds?.access_key || !this.creds?.access_key_secret) {
      return { ok: false, message: 'Live Mode needs Gong access key + secret.' };
    }
    const base = this.creds.base_url ?? 'https://api.gong.io';
    const res = await fetchWithBackoff(`${base}/v2/users`, {
      headers: { Authorization: this.authHeader() },
    });
    return res.ok
      ? { ok: true, message: 'Gong API authenticated.' }
      : { ok: false, message: `Gong returned ${res.status}.` };
  }

  async fetch(): Promise<RawSignalCandidate[]> {
    if (this.mode === 'test') {
      const fx = loadFixture('gong_sample.json');
      return [{ raw_text: fx.raw_text, source_type: 'gong', source_ref: fx.source_ref }];
    }
    if (!this.creds?.access_key || !this.creds?.access_key_secret) {
      throw new Error('Gong Live Mode requires access key + secret.');
    }

    const base = this.creds.base_url ?? 'https://api.gong.io';
    // Recent calls. A production build would page and window by date; kept to
    // a single recent page here, with backoff on rate limits.
    const res = await fetchWithBackoff(`${base}/v2/calls?fromDateTime=${recentIso()}`, {
      headers: { Authorization: this.authHeader() },
    });
    if (!res.ok) throw new Error(`Gong calls query failed: ${res.status}`);
    const data = await res.json();

    return (data.calls ?? []).map((call: Record<string, unknown>) => ({
      raw_text:
        (call.title ? `${call.title}. ` : '') +
        (typeof call.brief === 'string' ? call.brief : 'Gong call flagged for review.'),
      source_type: 'gong',
      source_ref: String(call.id ?? ''),
    }));
  }
}

// ISO for ~7 days ago — a reasonable default polling window.
function recentIso(): string {
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  // Date.now is available in the Next.js server runtime.
  return new Date(Date.now() - weekMs).toISOString();
}
