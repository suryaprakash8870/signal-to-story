// Brevo transactional email - used for the "Send via Email" publish action
// (an alternative to the Teams connector). Uses Brevo's REST API directly
// (https://api.brevo.com/v3/smtp/email) rather than SMTP, since we hold an
// API key (xkeysib-…), not SMTP credentials.

export interface BrevoConfig {
  apiKey: string;
  senderEmail: string;
  senderName: string;
}

/** Reads the Brevo config from env. Returns null if not configured. */
export function getBrevoConfig(): BrevoConfig | null {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME ?? 'Signal-to-Story';
  if (!apiKey || !senderEmail) return null;
  return { apiKey, senderEmail, senderName };
}

export interface SendEmailParams {
  to: string; // single recipient address, entered by the reviewer at publish time
  subject: string;
  text: string;
  html?: string;
}

/**
 * Sends one transactional email via the Brevo API. Throws with a readable
 * message on failure - the caller (the publish-email route) turns that into
 * a 502 rather than silently succeeding.
 */
export async function sendBrevoEmail(config: BrevoConfig, params: SendEmailParams): Promise<void> {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'api-key': config.apiKey,
    },
    body: JSON.stringify({
      sender: { name: config.senderName, email: config.senderEmail },
      to: [{ email: params.to }],
      subject: params.subject,
      textContent: params.text,
      ...(params.html ? { htmlContent: params.html } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo send failed: ${res.status} ${body.slice(0, 300)}`);
  }
}
