# 04 - Connectors

Every connector implements the same interface regardless of vendor or
direction. New connectors are added by writing one adapter - nothing else
in the pipeline changes.

## Interface

```typescript
// lib/connectors/connector.ts

export interface Connector {
  type: "teams" | "gmail" | "salesforce" | "gong" | "crayon";
  direction: "inbound" | "outbound";

  testConnection(): Promise<{ ok: boolean; message?: string }>;

  // Outbound only
  push?(payload: OutboundPayload): Promise<void>;

  // Inbound only
  fetch?(): Promise<RawSignalCandidate[]>;
}

export interface RawSignalCandidate {
  raw_text: string;
  source_type: string;
  source_ref?: string;
}
```

## Outbound: Microsoft Teams (live now)

Incoming Webhook per channel - no bot registration required for this.

```typescript
// lib/connectors/teams-connector.ts
export class TeamsConnector implements Connector {
  type = "teams" as const;
  direction = "outbound" as const;

  constructor(private webhookUrl: string) {}

  async testConnection() {
    const res = await fetch(this.webhookUrl, {
      method: "POST",
      body: JSON.stringify({ text: "Signal-to-Story Engine: connection test." }),
    });
    return { ok: res.ok };
  }

  async push(payload: OutboundPayload) {
    await fetch(this.webhookUrl, {
      method: "POST",
      body: JSON.stringify({ text: formatForTeams(payload) }),
    });
  }
}
```

**Known limitation to design around, not just note:** Incoming Webhooks
are one-way. There is no way for a reviewer to approve/reject from inside
Teams - all review happens in the web app (`05`, `06`). If Litera later
wants in-Teams approval, that requires the Microsoft Graph API and a
registered Teams bot with Litera IT's Azure AD consent - materially more
setup, and out of scope for this build.

## Outbound: Gmail (live now)

SMTP-based, reusing the same send infrastructure pattern as the agency's
existing news-digest system.

```typescript
// lib/connectors/gmail-connector.ts
export class GmailConnector implements Connector {
  type = "gmail" as const;
  direction = "outbound" as const;

  async testConnection() {
    // Verify SMTP auth succeeds without sending
  }

  async push(payload: OutboundPayload) {
    // Send via nodemailer + Gmail SMTP, using connectors.cadence
    // (weekly | biweekly) to decide whether this call fires now or queues
    // for the next scheduled digest run (see GitHub Actions trigger below)
  }
}
```

Gmail SMTP has no open/click tracking - do not build an "email open rate"
metric on this provider. See `10-OPTIMIZATION-NOTES.md` and
`09-BUILD-PHASES-AND-TASKS.md` for the adoption-metric alternative (Teams
reactions).

Digest sending is cadence-driven, not fired per-signal - trigger it via a
scheduled GitHub Actions job (same pattern as the existing digest system)
that reads `connectors.cadence` and batches all approved-but-not-yet-sent
outputs since the last run.

## Inbound: Salesforce, Gong, Crayon (Test Mode now, Live Mode later)

All three follow the same pattern: build the adapter and the UI now,
running against the fixtures in `08-TEST-FIXTURES-AND-TESTING.md`, with
`connectors.mode = 'test'`. Do not build real OAuth/API wiring until
credentials and any required approval are actually available - building
against guessed scopes now risks a rebuild later. Switching a connector
from `test` to `live` should require no pipeline changes - only flipping
`connectors.mode` and populating `credentials_ref`.

```typescript
// lib/connectors/salesforce-connector.ts
export class SalesforceConnector implements Connector {
  type = "salesforce" as const;
  direction = "inbound" as const;

  constructor(private mode: "test" | "live", private config: SalesforceConfig) {}

  async testConnection() {
    if (this.mode === "test") return { ok: true, message: "Running in Test Mode against fixture data." };
    // Live mode: real OAuth-authenticated connection check
  }

  async fetch(): Promise<RawSignalCandidate[]> {
    if (this.mode === "test") {
      return loadFixture("salesforce_sample.json").map(mapUsingConfig(this.config));
    }
    // Live mode: real Salesforce REST API query, using this.config for field mapping
  }
}
```

`SalesforceConfig` is exactly the `connectors.config` JSON described in
`01-DATA-MODEL.md` - the adapter must read field names from this config,
never hardcode them. The fixture file's own `config_mapping_example` block
is the placeholder until Litera's Salesforce admin confirms the real
object/field names.

Gong and Crayon connectors follow the identical shape - `fetch()` reads
`gong_sample.json` / `crayon_sample.json` in test mode, and the vendor's
real API in live mode. Gong's live-mode API access depends on Litera's
plan tier; Crayon supports outbound webhooks as an alternative to polling
if their plan includes it - prefer the webhook when available.

## Credential handling

```typescript
// lib/connectors/vault.ts
export async function resolveCredential(ref: string): Promise<string> {
  // Server-side only. Fetches from Supabase Vault by reference.
  // NEVER call this from client-side code, NEVER return the raw value
  // to any API route response body - resolve and use it in the same
  // server-side function.
}
```

The Connectors settings page (`06-FRONTEND-SPEC.md`) shows connection
status and a masked identifier only - it never renders a resolved
credential value.
