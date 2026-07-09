import nodemailer from 'nodemailer';
import type { Connector, OutboundPayload } from './connector';

// Gmail SMTP, reusing the same send pattern as the agency's existing
// news-digest system (04-CONNECTORS.md). No open/click tracking exists on
// SMTP — do not build an email-open-rate metric on this.

export interface GmailCredentials {
  user: string; // Gmail address used to authenticate + send
  pass: string; // Gmail App Password (not the account password)
  to: string; // digest recipients, comma-separated
}

export class GmailConnector implements Connector {
  type = 'gmail' as const;
  direction = 'outbound' as const;

  constructor(private creds: GmailCredentials) {}

  private transport() {
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: this.creds.user, pass: this.creds.pass },
    });
  }

  async testConnection() {
    try {
      await this.transport().verify(); // verifies SMTP auth without sending
      return { ok: true, message: 'Gmail SMTP authentication succeeded.' };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  // Single-output push (rarely used directly — Gmail is digest-driven).
  async push(payload: OutboundPayload) {
    await this.sendDigest('Signal-to-Story update', payload.content);
  }

  async sendDigest(subject: string, body: string) {
    await this.transport().sendMail({
      from: this.creds.user,
      to: this.creds.to,
      subject,
      text: body,
    });
  }
}

const OUTPUT_TYPE_LABELS: Record<string, string> = {
  talk_track: 'Talk track',
  battlecard_snippet: 'Battlecard',
  live_talking_points: 'Live talking points',
  watchout: 'Watch-out',
  marketing_angle: 'Marketing angle',
  leadership_summary: 'Leadership summary',
};

export interface DigestItem {
  audience: string;
  output_type: string;
  content: string;
  competitor?: string | null;
}

/** Renders a batch of approved outputs into a single plain-text digest. */
export function formatDigest(items: DigestItem[]): string {
  const sections = items.map((item, i) => {
    const label = OUTPUT_TYPE_LABELS[item.output_type] ?? item.output_type;
    const comp = item.competitor ? ` · ${item.competitor}` : '';
    return `${i + 1}. [${item.audience}] ${label}${comp}\n${item.content}`;
  });
  return `Signal-to-Story digest — ${items.length} approved item${
    items.length === 1 ? '' : 's'
  }\n\n${sections.join('\n\n---\n\n')}`;
}
