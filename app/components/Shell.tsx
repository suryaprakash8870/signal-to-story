'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import Sidebar from './Sidebar';
import NotificationBell from './NotificationBell';

// Routes that render full-screen, WITHOUT the app chrome (sidebar + header):
// the marketing home page and the login screen.
const FULLSCREEN = new Set(['/', '/login']);

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';

  if (FULLSCREEN.has(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-gray-200 bg-white px-4">
          <span className="flex-1 text-center text-2xl font-bold tracking-tight text-gray-900">
            Compete Agent
          </span>
          <div className="absolute right-4">
            <NotificationBell />
          </div>
        </header>
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8">{children}</div>
      </main>
    </div>
  );
}
