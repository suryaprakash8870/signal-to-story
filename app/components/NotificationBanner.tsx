'use client';

import Link from 'next/link';
import { useNotifications } from './useNotifications';

// "You have N new competitive signal(s) awaiting review" prompt. Shown on the
// Dashboard and the Review queue; hides itself when nothing is pending.
export default function NotificationBanner() {
  const { count } = useNotifications();
  if (count === 0) return null;
  return (
    <Link
      href="/review"
      className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 transition-colors hover:bg-orange-100"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#c74a1b] text-white">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-900">
          You have {count} new competitive signal{count === 1 ? '' : 's'} awaiting review.
        </span>
        <span className="block text-xs text-gray-600">Click to open the Review queue.</span>
      </span>
      <span className="shrink-0 text-sm font-semibold text-[#c74a1b]">Review →</span>
    </Link>
  );
}
