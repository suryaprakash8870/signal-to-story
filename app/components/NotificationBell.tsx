'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications } from './useNotifications';

// Header bell with an unread count and a dropdown of pending signals. "Unread"
// == still awaiting review; the count clears itself once signals are reviewed.
export default function NotificationBell() {
  const { count, signals } = useNotifications();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
              <span className="text-sm font-semibold text-gray-900">Notifications</span>
              {count > 0 && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                  {count} awaiting review
                </span>
              )}
            </div>
            {signals.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">You&rsquo;re all caught up.</div>
            ) : (
              <ul className="max-h-80 overflow-y-auto">
                {signals.map((s) => (
                  <li key={s.signalId}>
                    <button
                      onClick={() => {
                        setOpen(false);
                        router.push(`/signals/${s.signalId}`);
                      }}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50"
                    >
                      <span
                        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                          s.urgency === 'high' ? 'bg-red-500' : s.urgency === 'medium' ? 'bg-amber-500' : 'bg-gray-400'
                        }`}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900">
                          New competitive signal awaiting review
                        </span>
                        <span className="block truncate text-xs text-gray-500">
                          {s.competitor ?? 'Competitor'} · via {s.sourceType ?? 'source'}
                          {s.processing ? ' · processing…' : ` · ${s.urgency} urgency`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={() => {
                setOpen(false);
                router.push('/review');
              }}
              className="block w-full border-t border-gray-100 px-4 py-2.5 text-center text-sm font-medium text-[#c74a1b] hover:bg-orange-50"
            >
              Open Review queue
            </button>
          </div>
        </>
      )}
    </div>
  );
}
