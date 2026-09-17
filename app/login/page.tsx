'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

// Demo accounts, one per role, shown on the login screen so the app can be
// explored as each of them. What a person sees is shaped entirely by their
// role, so a single account only ever shows a third of the product.
//
// Local only - a page.tsx must not export arbitrary consts (breaks `next build`).
const DEMO_PASSWORD = '12345678';

const DEMO_ACCOUNTS = [
  {
    role: 'Admin',
    email: 'demo@compete-agent.com',
    sees: 'Everything, including users and connectors',
  },
  {
    role: 'Product Marketing Manager',
    email: 'pmm@compete-agent.com',
    sees: 'Reads the feed, and packages updates for each team',
  },
  {
    role: 'Product Manager',
    email: 'pm@compete-agent.com',
    sees: 'Research only: the feed, the filters and the Ask box',
  },
] as const;

// The "Try now" links from the home page (?demo=1) land on the admin account,
// which is the one that can reach every screen.
const DEMO_EMAIL = DEMO_ACCOUNTS[0].email;

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Prefill the demo credentials when arriving from a "Try now" link (?demo=1).
  useEffect(() => {
    if (searchParams.get('demo') === '1') {
      setEmail(DEMO_EMAIL);
      setPassword(DEMO_PASSWORD);
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      return;
    }
    // Return to wherever the user was headed before being redirected here.
    const redirect = searchParams.get('redirect');
    router.push(redirect && redirect.startsWith('/') ? redirect : '/intake');
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* Home-page background graphic, darkened so the card stays readable on
          the dark theme. The scrim was white in the light theme; on dark it has
          to darken rather than lighten or the page reads as a light page with a
          dark card dropped onto it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/2.jpg"
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-page/90 via-page/85 to-page/80" />

      <div className="relative w-full max-w-sm px-4">
        {/* Litera logo above the card - the mark itself is dark, so it needs a
            light backdrop to stay legible over the photo background. */}
        <div className="mb-6 flex justify-center">
          <div className="rounded-xl bg-white/95 px-5 py-2.5 shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {/* The full stacked logo works here because there is room for it.
                At the 32px it had, the wordmark was too small to read. */}
            <img src="/litera-logo.png" alt="Litera" className="h-12 w-auto object-contain" />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="card card-p w-full space-y-4 shadow-xl">
          <div className="text-center">
            <h1 className="page-title">Sign in</h1>
            <p className="muted mt-1 text-sm">Compete Agent</p>
          </div>

          {/* Demo accounts - pick a role and the fields fill themselves */}
          <div className="rounded-lg border border-accent-border bg-accent-soft p-3.5 text-xs">
            <p className="text-[13px] font-semibold text-accent">
              Explore as one of the three roles
            </p>
            <p className="mt-1 text-gray-600">
              Each role sees a different application. Pick one to fill the form.
            </p>

            <div className="mt-2.5 space-y-2">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(DEMO_PASSWORD);
                    setError(null);
                  }}
                  // `white` is left literal in this theme (see tailwind.config.js),
                  // so a bg-white/40 panel renders pale under near-white text and
                  // the description disappears. The theme's own surfaces are the
                  // ones that darken correctly.
                  className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                    email === account.email
                      ? 'border-accent bg-surface-subtle'
                      : 'border-border bg-surface hover:border-accent-border hover:bg-surface-subtle'
                  }`}
                >
                  <span className="block text-[13px] font-semibold text-gray-900">
                    {account.role}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-gray-600">
                    {account.sees}
                  </span>
                  {/* gray-400 maps to the muted token, which is too dim against
                      the surface at this size. gray-500/600 are the secondary
                      token and hold up. */}
                  <span className="mt-1 block font-mono text-[11px] text-gray-500">
                    {account.email}
                  </span>
                </button>
              ))}
            </div>

            <p className="mt-2.5 text-gray-600">
              Password for all three:{' '}
              <span className="font-mono text-gray-900">{DEMO_PASSWORD}</span>
            </p>
          </div>

          <div className="space-y-1">
            <label className="field-label">Email</label>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input w-full"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="field-label">Password</label>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input w-full"
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="btn btn-primary w-full">
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
