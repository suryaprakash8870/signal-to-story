'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

// Shared demo credentials — shown on the login screen and prefilled from the
// home page "Try now" links (?demo=1).
// Local only — a page.tsx must not export arbitrary consts (breaks `next build`).
const DEMO_EMAIL = 'demo@compete-agent.com';
const DEMO_PASSWORD = 'demo123';

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
        {/* Litera logo above the card */}
        <div className="mb-6 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/litera-logo.png" alt="Litera" className="h-10 w-auto object-contain" />
        </div>

        <form onSubmit={handleSubmit} className="card card-p w-full space-y-4 shadow-xl">
          <div className="text-center">
            <h1 className="page-title">Sign in</h1>
            <p className="muted mt-1 text-sm">Compete Agent</p>
          </div>

          {/* Demo credentials — for exploring the app */}
          <div className="rounded-lg border border-accent-border bg-accent-soft p-3 text-xs">
            <p className="font-semibold text-accent">Log in with these credentials to explore</p>
            <p className="mt-1 text-gray-700">
              Email: <span className="font-mono">{DEMO_EMAIL}</span>
            </p>
            <p className="text-gray-700">
              Password: <span className="font-mono">{DEMO_PASSWORD}</span>
            </p>
            <button
              type="button"
              onClick={() => {
                setEmail(DEMO_EMAIL);
                setPassword(DEMO_PASSWORD);
              }}
              className="mt-2 font-medium text-accent hover:underline"
            >
              Fill these credentials →
            </button>
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
