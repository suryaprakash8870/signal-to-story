import type { Connector, ConnectorType } from './connector';
import { TeamsConnector } from './teams-connector';
import { GmailConnector, type GmailCredentials } from './gmail-connector';
import { SalesforceConnector, type SalesforceConfig, type SalesforceCredentials } from './salesforce-connector';
import { GongConnector, type GongCredentials } from './gong-connector';
import { CrayonConnector, type CrayonCredentials } from './crayon-connector';
import { resolveCredential } from './vault';

export interface ConnectorRow {
  id: string;
  type: ConnectorType;
  direction: string;
  mode: string;
  credentials_ref: string | null;
  config: Record<string, unknown>;
  status: string;
  cadence: string | null;
}

// Resolves and JSON-parses a live-mode credential blob from Vault, if present.
async function liveCreds<T>(row: ConnectorRow): Promise<T | undefined> {
  if (row.mode !== 'live' || !row.credentials_ref) return undefined;
  const raw = await resolveCredential(row.credentials_ref);
  return JSON.parse(raw) as T;
}

/**
 * Builds a live Connector instance from a connectors table row, resolving any
 * credential from Vault server-side. Inbound connectors run in Test Mode
 * against fixtures (no credential) or Live Mode against the vendor API
 * (credentials from Vault) - switching is just the mode flag plus a credential,
 * with no pipeline changes (04-CONNECTORS.md).
 */
export async function buildConnector(row: ConnectorRow): Promise<Connector> {
  switch (row.type) {
    case 'teams': {
      if (!row.credentials_ref) {
        throw new Error('Teams connector has no webhook configured. Add it on the Connectors settings page.');
      }
      const webhookUrl = await resolveCredential(row.credentials_ref);
      return new TeamsConnector(webhookUrl);
    }

    case 'gmail': {
      if (!row.credentials_ref) {
        throw new Error('Gmail connector has no SMTP credentials configured. Add them on the Connectors settings page.');
      }
      const raw = await resolveCredential(row.credentials_ref);
      const creds = JSON.parse(raw) as GmailCredentials;
      return new GmailConnector(creds);
    }

    case 'salesforce':
      return new SalesforceConnector(
        (row.mode as 'test' | 'live') ?? 'test',
        (row.config ?? {}) as SalesforceConfig,
        await liveCreds<SalesforceCredentials>(row)
      );

    case 'gong':
      return new GongConnector(
        (row.mode as 'test' | 'live') ?? 'test',
        await liveCreds<GongCredentials>(row)
      );

    case 'crayon':
      return new CrayonConnector(
        (row.mode as 'test' | 'live') ?? 'test',
        await liveCreds<CrayonCredentials>(row)
      );

    default:
      throw new Error(`Connector type "${row.type}" is not built yet.`);
  }
}
