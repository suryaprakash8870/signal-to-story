import type { Connector, RawSignalCandidate } from './connector';
import { loadFixture } from './fixtures';
import { fetchWithBackoff } from './backoff';

export interface SalesforceConfig {
  object?: string;
  competitor_field?: string;
  reason_field?: string;
  notes_relation?: string;
}

// Live-mode credentials (OAuth), stored as JSON in Vault.
export interface SalesforceCredentials {
  instance_url: string; // e.g. https://litera.my.salesforce.com
  access_token: string; // OAuth bearer token
  api_version?: string; // e.g. v60.0
}

// Inbound. Test Mode reads salesforce_sample.json; Live Mode queries the
// Salesforce REST API. Field names come from connectors.config
// (04-CONNECTORS.md) — never hardcoded — because Litera's real object/field
// names are unconfirmed until their admin verifies them (Phase 2 gate).
export class SalesforceConnector implements Connector {
  type = 'salesforce' as const;
  direction = 'inbound' as const;

  constructor(
    private mode: 'test' | 'live',
    private config: SalesforceConfig,
    private creds?: SalesforceCredentials
  ) {}

  async testConnection() {
    if (this.mode === 'test') {
      return { ok: true, message: 'Running in Test Mode against fixture data.' };
    }
    if (!this.creds?.instance_url || !this.creds?.access_token) {
      return { ok: false, message: 'Live Mode needs Salesforce OAuth credentials.' };
    }
    // A cheap authenticated call verifies the token/instance.
    const version = this.creds.api_version ?? 'v60.0';
    const res = await fetchWithBackoff(`${this.creds.instance_url}/services/data/${version}/limits`, {
      headers: { Authorization: `Bearer ${this.creds.access_token}` },
    });
    return res.ok
      ? { ok: true, message: 'Salesforce API authenticated.' }
      : { ok: false, message: `Salesforce returned ${res.status}.` };
  }

  async fetch(): Promise<RawSignalCandidate[]> {
    if (this.mode === 'test') return this.fetchFixture();
    return this.fetchLive();
  }

  private fetchFixture(): RawSignalCandidate[] {
    const fx = loadFixture('salesforce_sample.json');
    return [{ raw_text: fx.raw_text, source_type: 'salesforce', source_ref: fx.source_ref }];
  }

  private async fetchLive(): Promise<RawSignalCandidate[]> {
    if (!this.creds?.instance_url || !this.creds?.access_token) {
      throw new Error('Salesforce Live Mode requires OAuth credentials.');
    }
    const version = this.creds.api_version ?? 'v60.0';
    const object = this.config.object ?? 'Opportunity';
    const competitorField = this.config.competitor_field;
    const reasonField = this.config.reason_field;
    if (!competitorField) {
      throw new Error('connectors.config.competitor_field must be set before Live Mode.');
    }

    // Build the SOQL from config field names, never hardcoded.
    const fields = ['Id', 'Name', competitorField, reasonField].filter(Boolean).join(', ');
    const soql = `SELECT ${fields} FROM ${object} WHERE ${competitorField} != null ORDER BY LastModifiedDate DESC LIMIT 50`;
    const url = `${this.creds.instance_url}/services/data/${version}/query?q=${encodeURIComponent(soql)}`;

    const res = await fetchWithBackoff(url, {
      headers: { Authorization: `Bearer ${this.creds.access_token}` },
    });
    if (!res.ok) throw new Error(`Salesforce query failed: ${res.status}`);
    const data = await res.json();

    return (data.records ?? []).map((rec: Record<string, unknown>) => {
      const competitor = competitorField ? rec[competitorField] : undefined;
      const reason = reasonField ? rec[reasonField] : undefined;
      const raw_text = [competitor && `Competitor: ${competitor}`, reason && `Reason: ${reason}`]
        .filter(Boolean)
        .join('. ');
      return {
        raw_text: raw_text || `Salesforce ${object} ${rec.Id} flagged a competitor.`,
        source_type: 'salesforce',
        source_ref: String(rec.Id),
      };
    });
  }
}
