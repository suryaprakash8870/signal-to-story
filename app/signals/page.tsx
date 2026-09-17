'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Loading from '../components/Loading';
import { useNotifications, useSeenSignals } from '../components/useNotifications';
import { stripEmoji } from '@/lib/text';
import NeedsAttention from '../components/NeedsAttention';

type Signal = {
  id: string;
  raw_text: string;
  source_type: string;
  status: string;
  submitted_at: string;
  // From the old Review queue, now carried on the signal itself.
  urgency: 'high' | 'medium' | 'low' | null;
  pendingTeams: number;
  unverified: boolean;
};

const URGENCY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

/** Awaiting a decision: packaged, with at least one team still unapproved. */
function awaitingReview(s: Signal) {
  return s.pendingTeams > 0 && s.status !== 'draft' && s.status !== 'error';
}

// 'draft' = pulled/created but NOT yet run through the pipeline → "pending".
function statusLabel(status: string) {
  return status === 'draft' ? 'pending' : status;
}
function statusBadge(status: string) {
  if (status === 'packaged' || status === 'published') return 'bg-emerald-50 text-emerald-700';
  if (status === 'error') return 'bg-red-50 text-red-700';
  if (status === 'rejected') return 'bg-gray-100 text-gray-500';
  if (status === 'draft') return 'bg-accent-soft text-accent'; // pending
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

  // The Review queue's summary, over signals rather than artefacts.
  const waiting = signals.filter(awaitingReview);
  const byUrgency = (u: string) => waiting.filter((s) => (s.urgency ?? 'low') === u).length;

  // Most urgent first, then newest. Anything still to process stays at the top
  // regardless: it cannot be reviewed until it has run.
  const ordered = [...signals].sort((a, b) => {
    const ap = a.status === 'draft' ? 0 : 1;
    const bp = b.status === 'draft' ? 0 : 1;
    if (ap !== bp) return ap - bp;
    const ua = URGENCY_ORDER[a.urgency ?? 'low'] ?? 2;
    const ub = URGENCY_ORDER[b.urgency ?? 'low'] ?? 2;
    if (ua !== ub) return ua - ub;
    return b.submitted_at.localeCompare(a.submitted_at);
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Signals</h1>
          {pendingCount > 0 && (
            <p className="muted mt-1 text-sm">
              {pendingCount} pending - click <span className="font-medium text-gray-700">Process</span> to run one through the pipeline.
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

      {/* Was the Review page. A summary belongs above the queue it summarises,
          not on a page of its own that could only link back to this one. */}
      {!loading && waiting.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Awaiting review" value={waiting.length} tone="plain" />
          <StatTile label="High" value={byUrgency('high')} tone="red" />
          <StatTile label="Medium" value={byUrgency('medium')} tone="amber" />
          <StatTile
            label="Unverified"
            value={waiting.filter((s) => s.unverified).length}
            tone="orange"
          />
        </div>
      )}

      <NeedsAttention />

      {loading ? (
        <div className="card">
          <Loading label="Loading signals…" />
        </div>
      ) : signals.length === 0 ? (
        <div className="card card-p muted">No signals yet - click “Fetch from Crayon” to pull the latest.</div>
      ) : (
        <ul className="space-y-3 md:max-h-[calc(100vh-14rem)] md:overflow-y-auto md:pr-1">
          {/* The queue only grows, so it scrolls in its own pane on large
              screens rather than stretching the page indefinitely. */}
          {ordered.map((s) => {
            const pending = s.status === 'draft';
            const isNew = unreadIds.has(s.id);
            const isViewed = !isNew && seen.has(s.id);
            const header = (
              <div className="flex items-center gap-2 text-xs">
                {isNew && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-surface" /> New
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
                {/* What the Review queue used to say, on the row itself. The
                    count is teams, matching the cards on the signal page. */}
                {awaitingReview(s) && (
                  <>
                    {s.urgency === 'high' && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-600">
                        High
                      </span>
                    )}
                    {s.urgency === 'medium' && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-600">
                        Medium
                      </span>
                    )}
                    <span className="text-gray-500">
                      {s.pendingTeams} {s.pendingTeams === 1 ? 'team' : 'teams'} awaiting review
                    </span>
                    {s.unverified && (
                      <span className="font-medium text-neon-orange">Unverified</span>
                    )}
                  </>
                )}
                <span className="ml-auto text-gray-400">{new Date(s.submitted_at).toLocaleString()}</span>
              </div>
            );

            if (pending) {
              return (
                <li key={s.id} className="card p-4">
                  {header}
                  <p className="clamp-2 mt-2 text-sm leading-relaxed text-gray-700">{stripEmoji(s.raw_text)}</p>
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
                <Link
                  href={`/signals/${s.id}`}
                  className="card flex items-start gap-3 p-4 transition-shadow hover:shadow-md"
                >
                  <div className="min-w-0 flex-1">
                    {header}
                    <p className="clamp-2 mt-2 text-sm leading-relaxed text-gray-700">{stripEmoji(s.raw_text)}</p>
                  </div>
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-gray-400">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Summary tile, carried over from the Review page. */
function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'plain' | 'red' | 'amber' | 'orange';
}) {
  const color =
    tone === 'red'
      ? 'text-red-600'
      : tone === 'amber'
      ? 'text-amber-600'
      : tone === 'orange'
      ? 'text-neon-orange'
      : 'text-gray-900';
  return (
    <div className="card card-p">
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
      <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
    </div>
  );
}
