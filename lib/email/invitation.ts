import { getBrevoConfig, sendBrevoEmail } from './brevo';

// The invitation email.
//
// Sent through Brevo rather than Supabase's own mailer. Supabase's built-in
// sender is rate limited to a handful of messages an hour and is not configured
// on this project, so `inviteUserByEmail` would create the account and then
// quietly fail to tell anyone. Brevo is already the app's proven outbound path
// - it carries the review notifications and the per-output sends - so the
// invitation rides the same rails.

function appUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface InvitationInput {
  to: string;
  /** The one-time link that signs them in so they can set a password. */
  actionLink: string;
  /** Human label for the role they are joining as. */
  roleLabel: string;
  /** Who sent it, for the "invited you" line. Falls back to the product name. */
  invitedBy?: string | null;
}

/**
 * Sends one invitation. Throws when Brevo is not configured or the send fails,
 * so the caller can tell the admin rather than reporting a success that never
 * reached anyone.
 */
export async function sendInvitation(input: InvitationInput): Promise<void> {
  const config = getBrevoConfig();
  if (!config) {
    throw new Error('Email is not configured (BREVO_API_KEY / BREVO_SENDER_EMAIL).');
  }

  const inviter = input.invitedBy?.trim() || 'Compete Agent';
  const link = input.actionLink;

  const text = [
    `${inviter} has invited you to Compete Agent.`,
    '',
    `You are joining as ${input.roleLabel}.`,
    '',
    'Open this link to set your password and sign in:',
    link,
    '',
    'The link works once and expires in 24 hours. If it has expired, ask an',
    'admin to send another.',
  ].join('\n');

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f7;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:24px 0;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;padding:32px;">
  <tr><td style="font-size:20px;font-weight:bold;color:#0b1a26;padding-bottom:8px;">
    You have been invited to Compete Agent
  </td></tr>
  <tr><td style="font-size:14px;color:#44606f;line-height:1.6;padding-bottom:20px;">
    ${esc(inviter)} has invited you to join as <strong>${esc(input.roleLabel)}</strong>.
    Set a password and you are in.
  </td></tr>
  <tr><td style="padding-bottom:20px;">
    <a href="${link}" style="display:inline-block;background:#F65100;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:12px 22px;border-radius:8px;">
      Set your password
    </a>
  </td></tr>
  <tr><td style="font-size:12px;color:#7a8f9b;line-height:1.6;">
    The link works once and expires in 24 hours. If it has expired, ask an admin
    to send another. If you were not expecting this, you can ignore this email.
  </td></tr>
</table>
</td></tr></table></body></html>`;

  await sendBrevoEmail(config, {
    to: input.to,
    subject: 'You have been invited to Compete Agent',
    text,
    html,
  });
}

/** Where an invitation link should land: the set-a-password screen. */
export function invitationRedirectUrl(): string {
  return `${appUrl()}/welcome`;
}

/**
 * Builds the link that goes in the email.
 *
 * Deliberately NOT Supabase's own `action_link`. That URL consumes its token on
 * the first GET, and an emailed link is fetched several times before a human
 * ever sees it: Brevo wraps it for click tracking, and Gmail pre-fetches links
 * to scan them. Whichever machine touches it first spends the token, and the
 * person clicking gets "expired" - which is exactly what happened on the first
 * test invitation.
 *
 * So the email points at our own page instead, carrying the hash. Nothing is
 * consumed by loading that page; the exchange happens in the browser, in
 * JavaScript, when a real person actually arrives. Scanners and trackers fetch
 * plain HTML and leave the token untouched.
 */
export function invitationLink(tokenHash: string, type: 'invite' | 'magiclink' = 'invite'): string {
  const params = new URLSearchParams({ token_hash: tokenHash, type });
  return `${appUrl()}/welcome?${params.toString()}`;
}
