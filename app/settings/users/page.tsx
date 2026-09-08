'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Loading from '../../components/Loading';
import { ROLE_LABELS, useRole } from '../../components/useRole';
import type { Role } from '@/lib/auth/roles';

// Admin screen for the role model in Dale Harris's "Roles, Access, and User
// Flows". This is the Admin's fourth setup task - "adds users and assigns
// roles" - and the only place a role can be changed without a database console.

// `role` is null for an account that exists in Supabase but has no profile row
// yet - normally impossible, since the signup trigger creates one, but real if
// that trigger ever failed or the account predates it.
type User = { id: string; role: Role | null; name: string | null; email: string | null; label: string };

/** Grouping key for someone with no role yet. */
const NO_ROLE = 'none';

/**
 * What each role gets, in one line. Shown beside the selector because "PMM" and
 * "PM" differ by a single letter and by the entire approval gate, which is a
 * bad thing to get wrong from a dropdown.
 */
const ROLE_SUMMARY: Record<Role, string> = {
  admin: 'Configures competitors, connectors and users. Can do anything a PMM can.',
  pmm: 'Reviews, edits, approves and distributes content for the competitors they own.',
  pm: 'Researches the feed and the Ask Box. Cannot approve or distribute.',
  consumer: 'Receives approved content in Teams and email. Phase 2.',
  viewer: 'Read-only observer. No research or distribution rights.',
};

const ORDER: Role[] = ['admin', 'pmm', 'pm', 'consumer', 'viewer'];

export default function UsersPage() {
  const { me, loading: roleLoading } = useRole();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('pm');
  const [inviting, setInviting] = useState(false);
  // Kept when the email could not be sent, so the admin can pass the link on
  // themselves rather than being stuck with an account nobody can reach.
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/users?scope=all');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Could not load users.');
        return;
      }
      setUsers(json.users ?? []);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeRole(user: User, role: Role) {
    setSavingId(user.id);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, role }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Could not change that role.');
        return;
      }
      setUsers((list) => list.map((u) => (u.id === user.id ? { ...u, role } : u)));
      setNotice(`${user.label} is now ${ROLE_LABELS[role] ?? role}.`);
    } finally {
      setSavingId(null);
    }
  }

  async function invite() {
    setInviting(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'The invitation could not be sent.');
        return;
      }
      setInviteEmail('');
      if (json.emailed) {
        setInviteLink(null);
        setNotice(`Invitation sent to ${json.email}. They join as ${ROLE_LABELS[inviteRole]}.`);
      } else {
        // The account is real and the link works; only the send failed. Hand
        // the link over rather than reporting a failure that is not one.
        setInviteLink(json.actionLink ?? null);
        setError(
          `${json.email} was added as ${ROLE_LABELS[inviteRole]}, but the email could not be sent` +
            `${json.emailError ? ` (${json.emailError})` : ''}. Copy the link below and send it to them.`
        );
      }
      await load();
    } finally {
      setInviting(false);
    }
  }

  /**
   * Sends a fresh sign-in link to someone who already has an account.
   *
   * Needed more often than it sounds. A link scanner following an emailed URL
   * can confirm the address and spend the token before the person clicks, which
   * leaves them unable to get in and, until this existed, unable to be invited
   * again either.
   */
  async function resend(user: User) {
    if (!user.email) return;
    setResendingId(user.id);
    setNotice(null);
    setError(null);
    setInviteLink(null);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, role: user.role ?? 'pm', resend: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'The link could not be sent.');
        return;
      }
      if (json.emailed) {
        setNotice(`A new sign-in link is on its way to ${user.email}.`);
      } else {
        setInviteLink(json.actionLink ?? null);
        setError(
          `The email could not be sent${json.emailError ? ` (${json.emailError})` : ''}. ` +
            'Copy the link below and send it to them.'
        );
      }
    } finally {
      setResendingId(null);
    }
  }

  // Grouped by role so an admin can see the shape of the workspace at a glance
  // rather than reading a flat list and counting.
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = q
      ? users.filter((u) => u.label.toLowerCase().includes(q) || (u.name ?? '').toLowerCase().includes(q))
      : users;
    // Any role outside the five is grouped too, rather than filtered away. A
    // user with an unrecognised role is exactly who an admin needs to find, and
    // silently hiding them makes the screen lie about who has access.
    const known = new Set<string>(ORDER);
    const extras = [
      ...new Set(matching.map((u) => u.role ?? NO_ROLE)),
    ].filter((r) => !known.has(r));
    return [...ORDER, ...extras]
      .map((role) => ({
        role,
        list: matching.filter((u) => (u.role ?? NO_ROLE) === role),
      }))
      .filter((g) => g.list.length > 0);
  }, [users, query]);

  if (roleLoading || loading) return <Loading />;

  if (me?.role !== 'admin') {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-xl font-semibold text-gray-900">Users and roles</h1>
        <p className="mt-3 text-sm text-gray-500">
          Only an admin can view or change roles. Ask an admin if you need access changed.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold text-gray-900">Users and roles</h1>
      <p className="mt-1 max-w-2xl text-sm text-gray-500">
        A role decides what someone sees and what they can do. Changing one takes
        effect the next time that person loads a page.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </div>
      )}
      {inviteLink && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-surface-subtle px-3 py-3">
          <div className="text-xs font-medium text-gray-500">
            One-time sign-in link — works once, expires in 24 hours
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              readOnly
              value={inviteLink}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-surface px-2.5 py-1.5 font-mono text-xs text-gray-700"
            />
            <button
              onClick={() => navigator.clipboard?.writeText(inviteLink)}
              className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 rounded-lg border border-gray-200 bg-surface px-4 py-4">
        <div className="text-sm font-medium text-gray-900">Invite someone</div>
        <p className="mt-0.5 text-xs text-gray-500">
          They get an email with a link to set their own password. Pick the role
          they land on — it can be changed at any time below.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="name@litera.com"
            className="min-w-56 flex-1 rounded-lg border border-gray-200 bg-surface-subtle px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-accent focus:outline-none"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as Role)}
            className="rounded-lg border border-gray-200 bg-surface-subtle px-2.5 py-2 text-sm text-gray-900 focus:border-accent focus:outline-none"
          >
            {ORDER.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <button
            onClick={invite}
            disabled={inviting || !inviteEmail.trim()}
            className="rounded-lg bg-action px-3.5 py-2 text-sm font-medium text-action-ink hover:bg-action-hover disabled:opacity-50"
          >
            {inviting ? 'Sending…' : 'Send invite'}
          </button>
        </div>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a person"
        className="mt-6 w-full rounded-lg border border-gray-200 bg-surface-subtle px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-accent focus:outline-none"
      />

      {grouped.length === 0 && (
        <p className="mt-6 text-sm text-gray-500">No one matches that.</p>
      )}

      {grouped.map(({ role, list }) => (
        <section key={role} className="mt-7">
          <div className="flex items-baseline gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
              {role === NO_ROLE ? 'No role yet' : ROLE_LABELS[role as Role] ?? role}
            </h2>
            <span className="text-xs text-gray-500">{list.length}</span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {role === NO_ROLE
              ? 'This account exists but has never been given a role, so it can see nothing. Pick one.'
              : ROLE_SUMMARY[role as Role] ??
                'Unrecognised role. Reassign this person to one of the five above.'}
          </p>

          <div className="mt-3 space-y-2">
            {list.map((user) => {
              const isMe = user.id === me.id;
              return (
                <div
                  key={user.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-surface px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {user.name || user.email || user.id}
                      {isMe && <span className="ml-2 text-xs font-normal text-gray-500">you</span>}
                    </div>
                    {user.name && user.email && (
                      <div className="truncate text-xs text-gray-500">{user.email}</div>
                    )}
                  </div>

                  <button
                    onClick={() => resend(user)}
                    disabled={resendingId === user.id || !user.email}
                    title="Send this person a fresh link to sign in and set a password"
                    className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                  >
                    {resendingId === user.id ? 'Sending…' : 'Resend invite'}
                  </button>

                  <select
                    value={user.role ?? ''}
                    disabled={savingId === user.id}
                    onChange={(e) => changeRole(user, e.target.value as Role)}
                    className="rounded-lg border border-gray-200 bg-surface-subtle px-2.5 py-1.5 text-sm text-gray-900 focus:border-accent focus:outline-none disabled:opacity-50"
                  >
                    {/* An unrecognised current role needs its own option, or
                        the select renders blank and looks broken. */}
                    {user.role === null && <option value="">No role yet</option>}
                    {user.role !== null && !ORDER.includes(user.role) && (
                      <option value={user.role}>{user.role} (unrecognised)</option>
                    )}
                    {ORDER.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <p className="mt-8 max-w-2xl text-xs text-gray-500">
        Everyone with an account appears here, whether they were invited above,
        signed up themselves, or were added directly in Supabase. New accounts
        start as Product Manager, which grants research access and nothing that
        reaches another team.
      </p>
    </div>
  );
}
