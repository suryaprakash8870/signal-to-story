'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

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
    <div className="flex min-h-[60vh] items-center justify-center">
      <form onSubmit={handleSubmit} className="card card-p w-full max-w-sm space-y-4">
        <h1 className="page-title">Sign in</h1>
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
  );
}
