'use client';

import { useEffect, useState } from 'react';
import type { Role } from '@/lib/auth/roles';

/** Human labels for the five roles, as named in Dale's document. */
export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  pmm: 'Product Marketing Manager',
  pm: 'Product Manager',
  consumer: 'Consumer',
  viewer: 'Viewer',
};

export interface Me {
  id: string;
  email: string | null;
  role: Role;
}

/**
 * The signed-in user and their role.
 *
 * `loading` matters: rendering navigation before the role is known would flash
 * every item and then remove the ones the user cannot use, which reads as a
 * permissions glitch. Callers render nothing role-dependent until it settles.
 */
export function useRole(): { me: Me | null; loading: boolean } {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setMe(data && data.role ? (data as Me) : null);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { me, loading };
}
