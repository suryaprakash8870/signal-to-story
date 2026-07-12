'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Crayon-style top navigation (see reference/ screenshot): product switcher on
// the left, a tab bar with a blue active underline, and search / new / avatar on
// the right. Pure UI — the search box and avatar are presentational.
const TABS = [
  { href: '/intake', label: 'Intake' },
  { href: '/review', label: 'Review' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/settings/competitors', label: 'Competitors' },
  { href: '/settings/connectors', label: 'Connectors' },
];

export default function TopNav() {
  const pathname = usePathname() ?? '';

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
      <div className="flex h-14 items-center gap-4 px-4 sm:px-6">
        {/* Product switcher */}
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-cyan-400 to-blue-600 text-sm font-bold text-white">
            S
          </span>
          <span className="hidden items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-sm font-medium text-gray-800 sm:flex">
            Compete Agent
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </div>

        {/* Tabs */}
        <nav className="no-scrollbar flex min-w-0 items-center gap-5 overflow-x-auto overflow-y-hidden">
          {TABS.map((tab) => {
            const active = pathname === tab.href || (tab.href !== '/intake' && pathname.startsWith(tab.href));
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`relative whitespace-nowrap py-4 text-sm font-medium transition-colors ${
                  active ? 'text-blue-700' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {tab.label}
                {active && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-blue-600" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right cluster */}
        <div className="ml-auto flex items-center gap-2">
          <div className="relative hidden md:block">
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="Search…"
              aria-label="Search"
              className="w-52 rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-sm text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <Link
            href="/intake"
            aria-label="New signal"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-700"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Link>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">
            SL
          </span>
        </div>
      </div>
    </header>
  );
}
