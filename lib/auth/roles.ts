import { NextResponse } from 'next/server';
import { supabaseForRequest, supabaseServiceRole } from '../supabase/server';

// The role model from Dale Harris's "Roles, Access, and User Flows".
//
// Every route that needs to know who is calling goes through here. The checks
// used to be copy-pasted as `role !== 'admin' && role !== 'reviewer'` across
// eight files, which meant a rule change had to be found in eight places and
// a route added later simply had no check at all.

export type Role = 'admin' | 'pmm' | 'pm' | 'consumer' | 'viewer';

/** Roles that package and distribute. Dale's section 3, rows 5 to 7. */
export const DISTRIBUTORS: Role[] = ['pmm', 'admin'];

/** Roles that may research: the 30-day feed and the Ask Box. */
export const RESEARCHERS: Role[] = ['pmm', 'admin', 'pm'];

/**
 * Shown when the ownership policy refuses a write.
 *
 * Routes that update through the caller's session cannot distinguish "you may
 * not" from "nothing matched", because a policy-blocked update simply affects
 * zero rows. Naming the rule is far more useful than a bare 403.
 */
export const DENIED_MESSAGE =
  'Only the PMM who owns this competitor can act on its content.';

export interface Actor {
  id: string;
  email: string | null;
  role: Role;
}

export type Guard = { ok: true; actor: Actor } | { ok: false; response: NextResponse };

function deny(status: number, error: string): Guard {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

/** Who is calling, or null when there is no session. */
export async function currentActor(): Promise<Actor | null> {
  const supabase = supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  // A signed-in user with no profile row is treated as the least privileged
  // role rather than being let through. The signup trigger creates the row, so
  // this only happens to accounts made before the trigger existed.
  return {
    id: user.id,
    email: user.email ?? null,
    role: ((profile as { role?: string } | null)?.role as Role) ?? 'viewer',
  };
}

/**
 * Requires a session whose role is in `allowed`.
 *
 * Returns the caller on success, or the response to send back. Callers should
 * write `const guard = await requireRole(...); if (!guard.ok) return guard.response;`
 */
export async function requireRole(allowed: Role[]): Promise<Guard> {
  const actor = await currentActor();
  if (!actor) return deny(401, 'unauthenticated');
  if (!allowed.includes(actor.role)) return deny(403, 'forbidden');
  return { ok: true, actor };
}

/**
 * Dale's rule one: only the PMM who owns a competitor may distribute that
 * competitor's content.
 *
 * Mirrors the row-level security policy on `signal_outputs` exactly, including
 * its fallback: when a signal's competitor has no owner, any PMM may act, so an
 * unassigned competitor does not become undistributable by anyone. That is the
 * safe default while Litera confirms whether every competitor must have a named
 * owner before go-live.
 *
 * The policy alone is not enough here, because distribution stamps the row
 * through the service role, which bypasses row-level security by design.
 */
export async function canDistribute(actor: Actor, outputId: string): Promise<boolean> {
  if (actor.role === 'admin') return true;
  if (actor.role !== 'pmm') return false;

  const db = supabaseServiceRole();

  const { data: output } = await db
    .from('signal_outputs')
    .select('signal_id')
    .eq('id', outputId)
    .maybeSingle();
  const signalId = (output as { signal_id?: string } | null)?.signal_id;
  if (!signalId) return false;

  const { data: classification } = await db
    .from('signal_classification')
    .select('competitor_id')
    .eq('signal_id', signalId)
    .maybeSingle();
  const competitorId = (classification as { competitor_id?: string | null } | null)?.competitor_id;

  // Unclassified, or classified to no known competitor: no owner exists, so the
  // PMM fallback applies.
  if (!competitorId) return true;

  const { data: competitor } = await db
    .from('competitors')
    .select('owner_id')
    .eq('id', competitorId)
    .maybeSingle();
  const ownerId = (competitor as { owner_id?: string | null } | null)?.owner_id ?? null;

  return ownerId === null || ownerId === actor.id;
}

/**
 * Whether this caller may edit a competitor's known facts.
 *
 * Matrix row 10 makes the watchlist itself Admin-managed - who is tracked, at
 * what tier, owned by whom. Known facts are a different thing: they are the
 * grounding text the interpretation prompt reads, and they belong to the PMM
 * who owns that competitor. Requiring an admin to type them would put a ticket
 * in front of routine work and quietly degrade note quality.
 *
 * So: an admin always, and the owning PMM for their own competitors.
 */
export async function canEditFacts(actor: Actor, competitorId: string): Promise<boolean> {
  if (actor.role === 'admin') return true;
  if (actor.role !== 'pmm') return false;

  const { data } = await supabaseServiceRole()
    .from('competitors')
    .select('owner_id')
    .eq('id', competitorId)
    .maybeSingle();

  return (data as { owner_id?: string | null } | null)?.owner_id === actor.id;
}

/**
 * Requires that the caller may distribute this specific output.
 *
 * The 403 says which rule was hit, because "forbidden" on a button the user can
 * see is a support ticket. A PMM who is not the owner needs to know that, not
 * guess at it.
 */
export async function requireDistributor(outputId: string): Promise<Guard> {
  const guard = await requireRole(DISTRIBUTORS);
  if (!guard.ok) {
    return guard.response.status === 403
      ? deny(403, 'Only a PMM or an admin can distribute content.')
      : guard;
  }
  if (!(await canDistribute(guard.actor, outputId))) {
    return deny(403, 'Only the PMM who owns this competitor can distribute its content.');
  }
  return guard;
}
