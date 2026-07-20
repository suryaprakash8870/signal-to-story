'use client';

// Hidden demo page — reachable only by typing /trigger (intentionally NOT in
// the sidebar). Clicking the button simulates Compete Agent detecting a new
// competitive signal: it stages a signal + runs the pipeline, and emails the
// PMM a "Review Signal" notification. The in-app badge/bell/banner light up
// once packaging completes.

import { useState } from 'react';

type Result = {
  ok?: boolean;
  signalId?: string;
  competitor?: string;
  emailed?: string[];
  recipients?: string[];
  emailError?: string | null;
  error?: string;
};

export default function TriggerPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function fire() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/trigger', { method: 'POST' });
      setResult(await res.json());
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : 'request failed' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 py-8">
      <div>
        <h1 className="page-title">Signal trigger (demo)</h1>
        <p className="muted mt-1 text-sm">
          Simulates Compete Agent detecting a new competitive signal from Crayon. It stages the
          signal, runs the pipeline, and emails the PMM a Review Signal notification.
        </p>
      </div>

      <div className="card card-p space-y-4">
        <p className="text-sm text-gray-600">
          Each click stages one new competitive signal (rotating across a few competitors) and emails
          the PMM a Review Signal notification. One trigger = one signal = one email.
        </p>
        <button onClick={fire} disabled={loading} className="btn btn-primary disabled:opacity-50">
          {loading ? 'Detecting signal…' : 'Trigger new signal'}
        </button>
      </div>

      {result && (
        <div className="card card-p space-y-2 text-sm">
          {result.error ? (
            <p className="text-red-600">Error: {result.error}</p>
          ) : (
            <>
              <p className="font-medium text-emerald-700">
                ✓ New signal detected{result.competitor ? ` — ${result.competitor}` : ''} and staged.
              </p>
              {result.emailError ? (
                <p className="text-amber-700">
                  Email could not be sent: {result.emailError}
                </p>
              ) : (
                <p className="text-gray-700">
                  📧 Notification emailed to:{' '}
                  <span className="font-medium">{(result.emailed ?? []).join(', ')}</span>
                </p>
              )}
              <p className="text-gray-500">
                The signal is processing — it will appear in your Review queue and the notification
                badge within a few seconds.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
