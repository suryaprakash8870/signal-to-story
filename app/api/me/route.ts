import { NextResponse } from 'next/server';
import { currentActor } from '@/lib/auth/roles';

// Reads the session, so it must never be statically evaluated at build time.
export const dynamic = 'force-dynamic';

/**
 * Who is signed in, and what they are allowed to be shown.
 *
 * The UI needs this to hide what a role cannot use. Hiding is a courtesy, not a
 * control: every capability is enforced server-side in the route that performs
 * it, and in the row-level policies underneath. A hidden button and a blocked
 * request are separate defences on purpose.
 */
export async function GET() {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  return NextResponse.json({ id: actor.id, email: actor.email, role: actor.role });
}
