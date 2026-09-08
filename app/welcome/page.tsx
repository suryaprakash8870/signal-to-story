'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

// Where an invitation link lands.
//
// The invite link signs the person in and drops the session in the URL
// fragment, which only the browser can read - which is why middleware lets this
// path through without a session. All that is left is choosing a password, so
// they can sign in normally from then on.

type State = 'checking' | 'ready' | 'expired' | 'saving' | 'done';

export default function WelcomePage() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={null}>
      <Welcome />
    </Suspense>
  );
}

function Welcome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<State>('checking');
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Two ways a person can arrive, and both are handled.
  //
  //   1. With `token_hash` in the query - what our invitation emails now send.
  //      The exchange happens HERE, in the browser, so nothing is spent by the
  //      link scanners and click trackers that fetch an emailed URL long before
  //      a human clicks it. That is what made the first test invitation read as
  //      "expired": Brevo's tracker and Gmail's scanner had already consumed
  //      Supabase's single-use verify link between sending and clicking.
  //
  //   2. With a session already in the URL fragment - Supabase's own action
  //      link, kept working for any invitation sent before the change.
  useEffect(() => {
    const supabase = supabaseBrowser();
    let settled = false;

    const settle = (userEmail: string | null) => {
      if (settled) return;
      settled = true;
      setEmail(userEmail);
      setState(userEmail ? 'ready' : 'expired');
    };

    const tokenHash = searchParams.get('token_hash');
    if (tokenHash) {
      const type = (searchParams.get('type') ?? 'invite') as 'invite' | 'magiclink' | 'recovery';
      supabase.auth
        .verifyOtp({ token_hash: tokenHash, type })
        .then(({ data, error: verifyErr }) => {
          if (verifyErr || !data.session) {
            settle(null);
            return;
          }
          settle(data.session.user.email ?? null);
          // Drop the token from the address bar so it is not left in history
          // or copied out of it by accident.
          window.history.replaceState({}, '', '/welcome');
        })
        .catch(() => settle(null));
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) settle(data.session.user.email ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) settle(session.user.email ?? null);
    });

    // Nothing in the URL and no session: the link was already used, or someone
    // opened this page directly.
    const timer = setTimeout(() => settle(null), 3000);

    return () => {
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, [searchParams]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Those two passwords do not match.');
      return;
    }

    setState('saving');
    const { error: updateErr } = await supabaseBrowser().auth.updateUser({ password });
    if (updateErr) {
      setError(updateErr.message);
      setState('ready');
      return;
    }

    setState('done');
    router.push('/feed');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-window border border-gray-200 bg-surface p-8">
        {state === 'checking' && (
          <p className="text-sm text-gray-500">Checking your invitation…</p>
        )}

        {state === 'expired' && (
          <>
            <h1 className="text-xl font-semibold text-gray-900">This link has expired</h1>
            <p className="mt-2 text-sm text-gray-500">
              Invitation links work once and last 24 hours. Ask an admin to send
              you another.
            </p>
            <a
              href="/login"
              className="mt-5 inline-block text-sm font-medium text-accent hover:text-accent-hover"
            >
              Go to sign in
            </a>
          </>
        )}

        {(state === 'ready' || state === 'saving' || state === 'done') && (
          <>
            <h1 className="text-xl font-semibold text-gray-900">Welcome to Compete Agent</h1>
            <p className="mt-2 text-sm text-gray-500">
              {email ? (
                <>
                  Choose a password for <span className="text-gray-700">{email}</span>. You
                  will use it to sign in from now on.
                </>
              ) : (
                'Choose a password to finish setting up your account.'
              )}
            </p>

            <form onSubmit={save} className="mt-6 space-y-3">
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password"
                className="w-full rounded-lg border border-gray-200 bg-surface-subtle px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-accent focus:outline-none"
              />
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat it"
                className="w-full rounded-lg border border-gray-200 bg-surface-subtle px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-accent focus:outline-none"
              />

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={state !== 'ready' || !password || !confirm}
                className="w-full rounded-lg bg-action px-4 py-2.5 text-sm font-medium text-action-ink hover:bg-action-hover disabled:opacity-50"
              >
                {state === 'saving' ? 'Saving…' : state === 'done' ? 'Signed in' : 'Set password and continue'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
