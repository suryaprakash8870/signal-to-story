import { NextRequest, NextResponse } from 'next/server';
import { supabaseServiceRole } from '@/lib/supabase/server';
import { DISTRIBUTORS, requireRole, type Role } from '@/lib/auth/roles';
import { sendInvitation, invitationLink, invitationRedirectUrl } from '@/lib/email/invitation';

// Reads request state and live data, so it must never be statically
// evaluated at build time.
export const dynamic = 'force-dynamic';

const ALL_ROLES: Role[] = ['admin', 'pmm', 'pm', 'consumer', 'viewer'];

/** Names used in the invitation email. Mirrors the labels on the Users screen. */
const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  pmm: 'Product Marketing Manager',
  pm: 'Product Manager',
  consumer: 'Consumer',
  viewer: 'Viewer',
};

/**
 * GET: list users.
 *
 * Two callers with different needs, so one query parameter separates them:
 *   ?scope=owners  (default) - only PMMs and admins, for the competitor owner
 *                              selector. Any distributor may read this.
 *   ?scope=all               - every user with their role, for the admin
 *                              Users screen. Admin only.
 *
 * `user_profiles` has no email column, so labels are resolved from auth.users
 * through the service role.
 */
export async function GET(req: NextRequest) {
  const scope = req.nextUrl.searchParams.get('scope') === 'all' ? 'all' : 'owners';

  const guard = await requireRole(scope === 'all' ? ['admin'] : DISTRIBUTORS);
  if (!guard.ok) return guard.response;

  const db = supabaseServiceRole();

  const { data: profiles, error } = await db.from('user_profiles').select('id, full_name, role');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id as string, p as { full_name: string | null; role: Role }])
  );

  const { data: list } = await db.auth.admin.listUsers();

  // The account list is the source of truth for who exists, not the profile
  // table. The signup trigger normally creates a profile the moment an account
  // is made - by invitation, by self-signup, or by an admin adding one in the
  // Supabase dashboard - but if that ever fails, the person would otherwise be
  // invisible on this screen and impossible to give a role to. Listing them
  // with a null role makes the gap visible and fixable.
  const users = (list?.users ?? [])
    .map((u) => {
      const profile = profileById.get(u.id);
      return {
        id: u.id,
        role: (profile?.role ?? null) as Role | null,
        name: profile?.full_name ?? null,
        email: u.email ?? null,
        // Kept for the existing owner selector, which renders `label` directly.
        label: u.email || profile?.full_name || u.id,
      };
    })
    .filter((u) => (scope === 'owners' ? u.role === 'pmm' || u.role === 'admin' : true))
    .sort((a, b) => a.label.localeCompare(b.label));

  return NextResponse.json({ users });
}

/**
 * PATCH: change one user's role. Admin only.
 *
 * An admin cannot demote themselves. Locking the last admin out of the
 * workspace would need a database console to undo, and the mistake is easy to
 * make on a screen whose whole purpose is changing roles.
 */
export async function PATCH(req: NextRequest) {
  const guard = await requireRole(['admin']);
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => ({}));
  const userId = typeof body?.userId === 'string' ? body.userId : '';
  const role = body?.role as Role;

  if (!userId || !ALL_ROLES.includes(role)) {
    return NextResponse.json({ error: 'A user and a valid role are required.' }, { status: 400 });
  }
  if (userId === guard.actor.id && role !== 'admin') {
    return NextResponse.json(
      { error: 'You cannot remove your own admin role. Ask another admin to do it.' },
      { status: 409 }
    );
  }

  const db = supabaseServiceRole();

  // The account must exist; the profile row need not. An account added straight
  // into Supabase whose trigger did not fire has no profile, and an `update`
  // there changes nothing while reporting success. Upserting creates the row
  // and assigns the role in one go.
  const { data: account, error: accountErr } = await db.auth.admin.getUserById(userId);
  if (accountErr || !account?.user) {
    return NextResponse.json({ error: 'That user no longer exists.' }, { status: 404 });
  }

  const { data, error } = await db
    .from('user_profiles')
    .upsert({ id: userId, role }, { onConflict: 'id' })
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'The role could not be saved.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * POST: invite someone by email, with the role they should land on. Admin only.
 *
 * Step 4 of the Admin flow is "Adds users and assigns roles". Until now a person
 * only appeared after signing in under their own steam, which is not something
 * an admin can arrange.
 *
 * The link is generated here rather than letting Supabase mail it. Supabase's
 * built-in sender is rate limited to a few messages an hour and is not set up on
 * this project, so `inviteUserByEmail` would create the account and then quietly
 * fail to tell anyone. Generating the link ourselves and sending it through
 * Brevo - the path that already carries review notifications - means the
 * invitation actually arrives.
 *
 * The link is returned to the caller as well. If the email fails for any reason
 * the account still exists and the admin can copy the link and send it however
 * they like, rather than being stuck.
 */
export async function POST(req: NextRequest) {
  const guard = await requireRole(['admin']);
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const role = (body?.role ?? 'pm') as Role;
  // An explicit resend from the list, rather than a new invitation.
  const resendRequested = body?.resend === true;

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
  }
  if (!ALL_ROLES.includes(role)) {
    return NextResponse.json({ error: 'That is not a valid role.' }, { status: 400 });
  }

  const db = supabaseServiceRole();

  // Someone who has already set a password does not need inviting; their role
  // is changed in the list instead. Someone invited but who never arrived is a
  // different case, and a common one - a lost email, a link a scanner spent -
  // so this resends rather than refusing.
  const { data: existing } = await db.auth.admin.listUsers();
  const already = (existing?.users ?? []).find((u) => (u.email ?? '').toLowerCase() === email);

  // "Confirmed" does not mean "has a password". A link scanner following the
  // emailed URL confirms the address and consumes the token, leaving someone
  // who can neither sign in nor be re-invited. That happened on the first test
  // invitation - invited 07:26, "signed in" 07:28, by a machine. So an admin
  // can always ask for another link explicitly; only an unrequested duplicate
  // is refused.
  if (already?.email_confirmed_at && !resendRequested) {
    return NextResponse.json(
      {
        error:
          'That person already has an account. Change their role below, or use Resend invite if they never got in.',
      },
      { status: 409 }
    );
  }
  const resending = Boolean(already);

  // A fresh invite link cannot be minted for an account that already exists, so
  // a resend uses a magic link instead. It lands on the same page and does the
  // same job: sign in once, then choose a password.
  const { data: link, error: linkErr } = await db.auth.admin.generateLink(
    resending
      ? { type: 'magiclink', email, options: { redirectTo: invitationRedirectUrl() } }
      : { type: 'invite', email, options: { redirectTo: invitationRedirectUrl() } }
  );
  // The hash, not Supabase's ready-made action link - see invitationLink().
  const tokenHash = (link as { properties?: { hashed_token?: string } } | null)?.properties
    ?.hashed_token;
  const newUserId = link?.user?.id ?? already?.id;

  if (linkErr || !tokenHash || !newUserId) {
    return NextResponse.json(
      { error: linkErr?.message ?? 'The account could not be created.' },
      { status: 502 }
    );
  }

  // The signup trigger has just created the profile at 'pm'. Move it to the
  // role the admin chose, so the invitation lands on the right capability.
  // Upsert rather than update: if the trigger ever fails, this still works.
  const { error: roleErr } = await db
    .from('user_profiles')
    .upsert({ id: newUserId, role }, { onConflict: 'id' });
  if (roleErr) {
    return NextResponse.json(
      { error: `Account created, but the role could not be set: ${roleErr.message}` },
      { status: 500 }
    );
  }

  // From here the account exists and is correct. A failed send is worth
  // reporting, but it is not a failed invitation - the link still works.
  let emailed = true;
  let emailError: string | null = null;
  try {
    await sendInvitation({
      to: email,
      actionLink: invitationLink(tokenHash, resending ? 'magiclink' : 'invite'),
      roleLabel: ROLE_LABELS[role],
      invitedBy: guard.actor.email,
    });
  } catch (err) {
    emailed = false;
    emailError = err instanceof Error ? err.message.slice(0, 160) : String(err);
  }

  return NextResponse.json({
    ok: true,
    id: newUserId,
    email,
    role,
    resent: resending,
    emailed,
    emailError,
    actionLink: invitationLink(tokenHash, resending ? 'magiclink' : 'invite'),
  });
}
