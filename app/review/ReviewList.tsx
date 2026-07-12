'use client';

import Link from 'next/link';
import { useState } from 'react';

export type ReviewItem = {
  id: string;
  signalId: string;
  audience: string;
  outputType: string;
  urgency: string;
  hasUnverified: boolean;
  sourceType: string | null;
  createdAt: string;
  preview: string;
};

const PAGE_SIZE = 12;

// Condensed page list: always show first, last, current and its neighbors,
// with '…' gaps. Keeps the control compact even at many pages.
function pageWindow(current: number, total: number): (number | '…')[] {
  const keep = new Set([1, total, current, current - 1, current + 1]);
  const nums = [...keep].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const p of nums) {
    if (p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

function ReviewCard({ it }: { it: ReviewItem }) {
  const stripe =
    it.urgency === 'high'
      ? 'border-l-red-500'
      : it.urgency === 'medium'
      ? 'border-l-amber-500'
      : 'border-l-gray-300';
  const dot =
    it.urgency === 'high' ? 'bg-red-500' : it.urgency === 'medium' ? 'bg-amber-500' : 'bg-gray-400';
  const badge =
    it.urgency === 'high'
      ? 'bg-red-50 text-red-700'
      : it.urgency === 'medium'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-gray-100 text-gray-600';

  return (
    <li>
      <Link
        href={`/signals/${it.signalId}`}
        className={`card block border-l-4 p-4 transition-shadow hover:shadow-md ${stripe}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold capitalize text-gray-900">{it.audience}</span>
              <span className="text-xs text-gray-300">·</span>
              <span className="text-xs text-gray-500">{it.outputType}</span>
            </div>
            <p className="clamp-2 mt-1.5 text-sm leading-relaxed text-gray-600">{it.preview}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
              {it.sourceType && <span className="pill">{it.sourceType}</span>}
              {it.hasUnverified && (
                <span className="rounded-full bg-orange-100 px-2 py-0.5 font-medium text-orange-700">
                  unverified claims
                </span>
              )}
              <span className="text-gray-400">{new Date(it.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${badge}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
              {it.urgency}
            </span>
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 text-gray-300"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>
        </div>
      </Link>
    </li>
  );
}

export default function ReviewList({ items }: { items: ReviewItem[] }) {
  const [page, setPage] = useState(1);

  if (items.length === 0) {
    return <div className="card card-p muted">Nothing pending review.</div>;
  }

  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const pageItems = items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="space-y-3">
      <p className="muted text-sm">
        {items.length} pending
        {items.length > PAGE_SIZE &&
          ` · showing ${(current - 1) * PAGE_SIZE + 1}–${Math.min(current * PAGE_SIZE, items.length)}`}
      </p>

      <ul className="space-y-3">
        {pageItems.map((it) => (
          <ReviewCard key={it.id} it={it} />
        ))}
      </ul>

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={current === 1}
            className="btn btn-outline"
          >
            Previous
          </button>
          <div className="flex items-center gap-1">
            {pageWindow(current, pageCount).map((n, i) =>
              n === '…' ? (
                <span key={`gap-${i}`} className="px-1 text-sm text-gray-400">
                  …
                </span>
              ) : (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`h-8 w-8 rounded-lg text-sm font-medium ${
                    n === current
                      ? 'bg-[#c74a1b] text-white'
                      : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {n}
                </button>
              )
            )}
          </div>
          <button
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={current === pageCount}
            className="btn btn-outline"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
