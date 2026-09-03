'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useNotifications } from './useNotifications';

// Collapsible left sidebar navigation. Pure UI - no data or handlers beyond
// routing and the open/close toggle.
function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

type Item = { href: string; label: string; icon: ReactNode };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Workspace',
    items: [
      { href: '/intake', label: 'New signal', icon: <Svg><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" /></Svg> },
      { href: '/signals', label: 'Signals', icon: <Svg><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></Svg> },
      { href: '/feed', label: 'Competitor feed', icon: <Svg><path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" /></Svg> },
      { href: '/review', label: 'Review', icon: <Svg><rect width="8" height="4" x="8" y="2" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="m9 14 2 2 4-4" /></Svg> },
    ],
  },
  {
    title: 'Insights',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: <Svg><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></Svg> },
      { href: '/analytics', label: 'Analytics', icon: <Svg><path d="M3 3v18h18" /><path d="M18 17V9M13 17V5M8 17v-3" /></Svg> },
    ],
  },
  {
    title: 'Settings',
    items: [
      { href: '/settings/competitors', label: 'Competitors', icon: <Svg><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></Svg> },
      { href: '/settings/context', label: 'Context library', icon: <Svg><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></Svg> },
      { href: '/settings/connectors', label: 'Connectors', icon: <Svg><path d="M9 2v6M15 2v6" /><path d="M18 8v5a6 6 0 0 1-12 0V8Z" /><path d="M12 19v3" /></Svg> },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === '/intake') return pathname === '/intake';
  return pathname === href || pathname.startsWith(`${href}/`) || pathname.startsWith(href);
}

export default function Sidebar() {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [userToggled, setUserToggled] = useState(false);
  const { count } = useNotifications();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    supabaseBrowser()
      .auth.getUser()
      .then(({ data }) =>
        setName(data.user?.user_metadata?.full_name ?? data.user?.email ?? null)
      );
  }, []);

  // Auto-collapse to the icon rail on narrower viewports, unless the user has
  // explicitly toggled it - matches the width the manual toggle already uses.
  useEffect(() => {
    if (userToggled) return;
    const mq = window.matchMedia('(max-width: 1024px)');
    setCollapsed(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setCollapsed(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [userToggled]);

  async function logout() {
    await supabaseBrowser().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  // The login screen stands on its own - no app chrome.
  if (pathname === '/login') return null;

  return (
    <aside
      style={{ width: collapsed ? 64 : 240, minWidth: collapsed ? 64 : 240 }}
      className="sticky top-0 flex h-screen shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-surface"
    >
      {/* Brand - Litera logo links home */}
      <div className={`flex h-14 items-center px-3 ${collapsed ? 'justify-center' : ''}`}>
        <Link
          href="/"
          aria-label="Home"
          className="flex h-9 items-center transition-transform hover:scale-105"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/litera-logo.png" alt="Litera" className="h-8 w-auto object-contain" />
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {GROUPS.map((group) => (
          <div key={group.title} className="mb-4">
            {!collapsed && (
              <div className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                {group.title}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const showBadge = item.href === '/signals' && count > 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`relative flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition-colors ${
                      active ? 'bg-action-soft pl-[9px] pr-2.5 text-action' : 'px-2.5 text-gray-600 hover:bg-gray-100'
                    } ${collapsed ? 'justify-center' : ''}`}
                  >
                    {active && (
                      <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-action" />
                    )}
                    <span className="relative">
                      {item.icon}
                      {showBadge && collapsed && (
                        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
                      )}
                    </span>
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {showBadge && !collapsed && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                        {count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Collapse / expand toggle */}
      <button
        onClick={() => {
          setUserToggled(true);
          setCollapsed((c) => !c);
        }}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={`mx-2 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 ${
          collapsed ? 'justify-center' : ''
        }`}
      >
        <svg viewBox="0 0 24 24" className={`h-5 w-5 shrink-0 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        {!collapsed && <span>Collapse</span>}
      </button>

      {/* Profile + logout */}
      <div className="mt-1 border-t border-gray-200 p-2">
        <div className={`flex items-center gap-2 rounded-lg px-1.5 py-1.5 ${collapsed ? 'justify-center' : ''}`}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-600">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-gray-900">{name ?? 'My Account'}</div>
              <div className="truncate text-xs text-gray-500">Product Manager</div>
            </div>
          )}
        </div>
        <button
          onClick={logout}
          title={collapsed ? 'Sign out' : undefined}
          className={`mt-1 flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="m16 17 5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
