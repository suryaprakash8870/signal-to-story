'use client';

import { useCallback, useEffect, useState } from 'react';

export type PendingSignal = {
  signalId: string;
  competitor: string | null;
  urgency: string;
  sourceType: string | null;
  createdAt: string;
  processing?: boolean;
};

// "Seen" signals are tracked in localStorage so the count behaves like a
// Jira/GitHub notification bell: opening a signal marks it read and drops it
// from the badge immediately, even before it is approved. (Once approved or
// published, the server stops returning it anyway.)
const SEEN_KEY = 'compete_seen_signals';

function getSeen(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

/** Mark a signal as seen (call when its detail page opens) and notify listeners. */
export function markSignalSeen(id: string) {
  if (typeof window === 'undefined') return;
  const seen = getSeen();
  if (seen.has(id)) return;
  seen.add(id);
  localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  window.dispatchEvent(new Event('notifications-changed'));
}

/** Reactive set of seen signal ids — for "New" vs "Viewed" tags in lists. */
export function useSeenSignals(): Set<string> {
  const [seen, setSeen] = useState<Set<string>>(() => getSeen());
  useEffect(() => {
    const update = () => setSeen(getSeen());
    window.addEventListener('notifications-changed', update);
    window.addEventListener('storage', update);
    window.addEventListener('focus', update);
    return () => {
      window.removeEventListener('notifications-changed', update);
      window.removeEventListener('storage', update);
      window.removeEventListener('focus', update);
    };
  }, []);
  return seen;
}

// Single source of truth for the badge (sidebar), bell (header), and dashboard
// banner. Polls the server on a short interval, refreshes instantly on tab
// focus, and re-derives instantly when a signal is marked seen.
export function useNotifications(pollMs = 6_000) {
  const [raw, setRaw] = useState<PendingSignal[]>([]);
  const [, setTick] = useState(0); // bump to re-derive against localStorage

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      setRaw(json.signals ?? []);
    } catch {
      /* transient — keep last known values */
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollMs);
    const onFocus = () => refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const onChanged = () => setTick((t) => t + 1); // seen-set changed → re-derive
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('notifications-changed', onChanged);
    window.addEventListener('storage', onChanged);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('notifications-changed', onChanged);
      window.removeEventListener('storage', onChanged);
    };
  }, [refresh, pollMs]);

  const seen = getSeen();
  const signals = raw.filter((s) => !seen.has(s.signalId));
  return { count: signals.length, signals, refresh };
}
