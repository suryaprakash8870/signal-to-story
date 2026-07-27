'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Loading from '../components/Loading';
import { useNotifications, useSeenSignals } from '../components/useNotifications';

type Signal = {
  id: string;
  raw_text: string;
  source_type: string;
  status: string;
  submitted_at: string;
};

// 'draft' = pulled/created but NOT yet run through the pipeline → "pending".
function statusLabel(status: string) {
  return status === 'draft' ? 'pending' : status;
}
function statusBadge(status: string) {
  if (status === 'packaged' || status === 'published') return 'bg-emerald-50 text-emerald-700';
  if (status === 'error') return 'bg-red-50 text-red-700';
  if (status === 'rejected') return 'bg-gray-100 text-gray-500';
  if (status === 'draft') return 'bg-orange-50 text-[#c74a1b]'; // pending
  return 'bg-amber-50 text-amber-700'; // classified / interpreted (processing)
}

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const router = useRouter();

  // "New" = awaiting review and not yet opened; "Viewed" = opened at least once.
  const { signals: unread } = useNotifications();
  const unreadIds = new Set(unread.map((u) => u.signalId));
  const seen = useSeenSignals();

  function load() {
    return fetch('/api/signals')
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setError(j.error);
        else setSignals(j.signals ?? []);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function process(id: string) {
    setProcessing(id);
    const res = await fetch(`/api/signals/${id}/process`, { method: 'POST' });
    const j = await res.json();
    if (!res.ok) {
      alert(j.error ?? 'process failed');
      setProcessing(null);
      return;
    }
    // Watch it run on the detail page (it polls until packaged).
    router.push(`/signals/${id}`);
  }

  // Pull fresh signals from Crayon (same action as Connectors → "Fetch now"),
  // then reload the list so the new pending signals appear.
  async function fetchCrayon() {
    setFetching(true);
    setError(null);
    try {
      const res = await fetch('/api/connectors/crayon/fetch', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? 'fetch failed');
        return;
      }
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setFetching(false);
    }
  }

  const pendingCount = signals.filter((s) => s.status === 'draft').length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Signals</h1>
          {pendingCount > 0 && (
            <p className="muted mt-1 text-sm">
              {pendingCount} pending — click <span className="font-medium text-gray-700">Process</span> to run one through the pipeline.
            </p>
          )}
        </div>
        <button
          onClick={fetchCrayon}
          disabled={fetching}
          className="btn btn-primary disabled:opacity-50"
        >
          {fetching ? 'Fetching…' : 'Fetch from Crayon'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <div className="card">
          <Loading label="Loading signals…" />
        </div>
      ) : signals.length === 0 ? (
        <div className="card card-p muted">No signals yet — click “Fetch from Crayon” to pull the latest.</div>
      ) : (
        <ul className="space-y-3">
          {signals.map((s) => {
            const pending = s.status === 'draft';
            const isNew = unreadIds.has(s.id);
            const isViewed = !isNew && seen.has(s.id);
            const header = (
              <div className="flex items-center gap-2 text-xs">
                {isNew && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-white" /> New
                  </span>
                )}
                {isViewed && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-500">
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                    Viewed
                  </span>
                )}
                <span className={`rounded-full px-2 py-0.5 font-medium capitalize ${statusBadge(s.status)}`}>
                  {statusLabel(s.status)}
                </span>
                <span className="text-gray-500">{s.source_type}</span>
                <span className="ml-auto text-gray-400">{new Date(s.submitted_at).toLocaleString()}</span>
              </div>
            );

            if (pending) {
              return (
                <li key={s.id} className="card p-4">
                  {header}
                  <p className="clamp-2 mt-2 text-sm leading-relaxed text-gray-700">{s.raw_text}</p>
                  <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
                    <button
                      onClick={() => process(s.id)}
                      disabled={processing === s.id}
                      className="btn btn-primary text-xs disabled:opacity-50"
                    >
                      {processing === s.id ? 'Starting…' : 'Process'}
                    </button>
                    <Link href={`/signals/${s.id}`} className="btn btn-outline text-xs">
                      View
                    </Link>
                  </div>
                </li>
              );
            }

            return (
              <li key={s.id}>
                <Link href={`/signals/${s.id}`} className="card block p-4 transition-shadow hover:shadow-md">
                  {header}
                  <p className="clamp-2 mt-2 text-sm leading-relaxed text-gray-700">{s.raw_text}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
