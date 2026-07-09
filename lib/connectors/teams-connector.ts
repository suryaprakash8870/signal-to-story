import type { Connector, OutboundPayload } from './connector';

// Microsoft Teams Incoming Webhook — one-way, per-channel. No bot
// registration required. Known limitation (04-CONNECTORS.md): there is no
// way to approve/reject from inside Teams; all review stays in the web app.

const OUTPUT_TYPE_LABELS: Record<string, string> = {
  talk_track: 'Talk track',
  battlecard_snippet: 'Battlecard',
  live_talking_points: 'Live talking points',
  watchout: 'Watch-out',
  marketing_angle: 'Marketing angle',
  leadership_summary: 'Leadership summary',
};

// Left-bar theme color, by urgency — draws the eye to hot signals.
const URGENCY_COLOR: Record<string, string> = {
  high: 'D13438', // red
  medium: 'E8A317', // amber
  low: '797775', // grey
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Builds a Teams MessageCard (Office 365 connector card). Teams renders it as
 * a card with a colored left bar (by urgency), a title, a facts table, the
 * content, and a footer showing who approved it and when.
 */
export function buildTeamsCard(payload: OutboundPayload) {
  const typeLabel = OUTPUT_TYPE_LABELS[payload.output_type] ?? payload.output_type;
  const audience = cap(payload.audience);
  const urgency = payload.urgency ?? 'low';

  const facts: { name: string; value: string }[] = [
    { name: 'Urgency', value: cap(urgency) },
  ];
  if (payload.competitor) facts.push({ name: 'Competitor', value: payload.competitor });
  if (payload.source_type) facts.push({ name: 'Source', value: `via ${payload.source_type}` });
  if (payload.approved_by_name) facts.push({ name: 'Approved by', value: payload.approved_by_name });
  if (payload.published_date) facts.push({ name: 'Date', value: payload.published_date });

  return {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: URGENCY_COLOR[urgency] ?? URGENCY_COLOR.low,
    summary: `Competitive signal for ${audience} — ${typeLabel}`,
    sections: [
      {
        activityTitle: `**Competitive signal · ${audience}**`,
        activitySubtitle: typeLabel,
        facts,
        text: payload.content,
        markdown: true,
      },
    ],
  };
}

export class TeamsConnector implements Connector {
  type = 'teams' as const;
  direction = 'outbound' as const;

  constructor(private webhookUrl: string) {}

  async testConnection() {
    try {
      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Signal-to-Story Engine: connection test.' }),
      });
      return res.ok
        ? { ok: true, message: 'Test message posted to the Teams channel.' }
        : { ok: false, message: `Teams webhook returned ${res.status} ${res.statusText}.` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  async push(payload: OutboundPayload) {
    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildTeamsCard(payload)),
    });
    if (!res.ok) {
      throw new Error(`Teams push failed: ${res.status} ${res.statusText}`);
    }
  }
}
