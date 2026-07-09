'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';

type Signal = {
  id: string;
  raw_text: string;
  source_type: string;
  status: string;
  submitted_at: string;
};

// Minutes after which a mid-pipeline signal is treated as likely orphaned
// (the pipeline is normally far quicker than this).
const STUCK_AFTER_MIN = 5;

export default function NeedsAttention() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/review/needs-attention');
    const json = await res.json();
    if (res.ok) setSignals(json.signals);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function retry(id: string) {
    setRetrying(id);
    try {
      await fetch(`/api/signals/${id}/retry`, { method: 'POST' });
      await load();
    } finally {
      setRetrying(null);
    }
  }

  if (signals.length === 0) return null;

  const ageMin = (iso: string) => (Date.now() - new Date(iso).getTime()) / 60000;

  return (
    <div className="card card-p space-y-3">
      <h2 className="section-title">Needs attention</h2>
      <ul className="space-y-2">
        {signals.map((s) => {
          const isError = s.status === 'error';
          const isStuck = !isError && ageMin(s.submitted_at) > STUCK_AFTER_MIN;
          const inProgress = !isError && !isStuck;
          return (
            <li
              key={s.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs">
                  {isError && (
                    <span className="pill bg-red-100 text-red-600">error</span>
                  )}
                  {isStuck && (
                    <span className="pill bg-amber-100 text-amber-700">
                      stuck · {s.status}
                    </span>
                  )}
                  {inProgress && (
                    <span className="pill bg-gray-100 text-gray-600">
                      in progress · {s.status}
                    </span>
                  )}
                  <span className="text-gray-500">{s.source_type}</span>
                </div>
                <Link href={`/signals/${s.id}`} className="mt-1 block truncate text-sm text-gray-700 hover:underline">
                  {s.raw_text}
                </Link>
              </div>
              {(isError || isStuck) && (
                <button
                  onClick={() => retry(s.id)}
                  disabled={retrying === s.id}
                  className="btn btn-outline shrink-0"
                >
                  {retrying === s.id ? 'Retrying…' : 'Retry'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
