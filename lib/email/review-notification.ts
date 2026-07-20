// "New competitive signal awaiting review" notification — emailed to the PMM
// so they know there is work waiting, with a Review Signal button that deep
// links back into the app (login gate → dashboard). Reuses the Brevo REST API
// (same provider as the per-output Send-via-Email publish action).

import { getBrevoConfig } from './brevo';

export interface ReviewNotificationInput {
  signalId: string;
  competitor?: string | null;
  urgency?: string | null;
  excerpt?: string | null;
}

/** Recipients from PMM_NOTIFY_EMAIL (comma-separated for multiple PMMs). */
export function getPmmRecipients(): string[] {
  return (process.env.PMM_NOTIFY_EMAIL ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function appUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Sends the review-notification email. Returns the recipients it went to.
 * Throws if Brevo is not configured or the send fails, so the caller can
 * surface it (the trigger route reports it; auto-detect callers log it).
 */
export async function sendReviewNotification(input: ReviewNotificationInput): Promise<string[]> {
  const config = getBrevoConfig();
  if (!config) {
    throw new Error('Brevo is not configured (BREVO_API_KEY / BREVO_SENDER_EMAIL).');
  }
  const recipients = getPmmRecipients();
  if (recipients.length === 0) {
    throw new Error('No PMM recipients configured (set PMM_NOTIFY_EMAIL).');
  }

  const competitor = input.competitor?.trim() || 'a competitor';
  const urgency = (input.urgency || 'high').toUpperCase();
  const excerpt = (input.excerpt || '').trim();
  // Land on the Signals list (New/Viewed tags highlight what's pending). If the
  // reviewer isn't logged in, middleware routes them via /login and back here.
  const reviewUrl = `${appUrl()}/signals`;

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f7;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:24px 0;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
<tr><td style="background:#c74a1b;padding:20px 28px;"><span style="color:#ffffff;font-size:18px;font-weight:bold;">Compete Agent</span><span style="color:#ffd9c9;font-size:12px;">&nbsp;&nbsp;·&nbsp;&nbsp;Competitive Intelligence</span></td></tr>
<tr><td style="padding:28px 28px 8px 28px;"><span style="display:inline-block;background:#fdecec;color:#c0392b;font-size:11px;font-weight:bold;padding:4px 10px;border-radius:999px;">${esc(urgency)} URGENCY</span></td></tr>
<tr><td style="padding:6px 28px 0 28px;"><h1 style="margin:0;font-size:20px;color:#1f2937;">You have 1 new competitive signal awaiting review</h1></td></tr>
<tr><td style="padding:14px 28px 0 28px;"><p style="margin:0;font-size:14px;line-height:22px;color:#4b5563;"><b>Competitor:</b> ${esc(competitor)}<br><b>Source:</b> Crayon${excerpt ? `<br><b>Signal:</b> ${esc(excerpt)}` : ''}</p></td></tr>
<tr><td style="padding:16px 28px 4px 28px;"><p style="margin:0;font-size:14px;line-height:22px;color:#4b5563;">The agent has prepared tailored updates for the <b>Executive Leadership Team, Product Management, Marketing, and Sales &amp; Customer Success</b>. They are waiting for your review and approval.</p></td></tr>
<tr><td style="padding:24px 28px 28px 28px;"><table cellpadding="0" cellspacing="0"><tr><td style="background:#c74a1b;border-radius:10px;"><a href="${reviewUrl}" style="display:inline-block;padding:13px 30px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;">Review Signal &rarr;</a></td></tr></table></td></tr>
<tr><td style="padding:0 28px 28px 28px;"><p style="margin:0;font-size:12px;line-height:18px;color:#9ca3af;">Nothing is sent to any team until you review and approve it. If the button doesn&rsquo;t open, go to <span style="color:#c74a1b;">${reviewUrl}</span>.</p></td></tr>
<tr><td style="background:#fafafa;border-top:1px solid #eee;padding:14px 28px;"><span style="font-size:11px;color:#9ca3af;">Compete Agent for Litera · You are receiving this because you are the designated reviewer (PMM).</span></td></tr>
</table></td></tr></table></body></html>`;

  const text = `New competitive signal awaiting review\n\nCompetitor: ${competitor}\nSource: Crayon${
    excerpt ? `\nSignal: ${excerpt}` : ''
  }\n\nThe agent has prepared tailored updates for the Executive Leadership Team, Product Management, Marketing, and Sales & Customer Success. They await your review and approval.\n\nReview Signal: ${reviewUrl}\n\nNothing is sent to any team until you approve it.`;

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'api-key': config.apiKey,
    },
    body: JSON.stringify({
      sender: { name: 'Compete Agent', email: config.senderEmail },
      to: recipients.map((email) => ({ email })),
      subject: `🔔 New competitive signal awaiting review — ${competitor}`,
      htmlContent: html,
      textContent: text,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo send failed: ${res.status} ${body.slice(0, 300)}`);
  }
  return recipients;
}
