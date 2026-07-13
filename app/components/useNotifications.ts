'use client';

import { useCallback, useEffect, useState } from 'react';

export type PendingSignal = {
  signalId: string;
  competitor: string | null;
  urgency: string;
  sourceType: string | null;
  createdAt: string;
};

// Single source of truth for the badge (sidebar), the bell (header), and the
// dashboard banner. Polls /api/notifications so a newly detected signal shows
// up within the poll interval; each consumer calls this independently.
export function useNotifications(pollMs = 20_000) {
  const [count, setCount] = useState(0);
  const [signals, setSignals] = useState<PendingSignal[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      setCount(json.count ?? 0);
      setSignals(json.signals ?? []);
    } catch {
      /* transient — keep last known values */
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { count, signals, refresh };
}
