import { NextRequest, NextResponse } from 'next/server';
import { supabaseServiceRole } from '@/lib/supabase/server';
import { DISTRIBUTORS, requireRole } from '@/lib/auth/roles';

// Reads the session, so it must never be statically evaluated at build time.
export const dynamic = 'force-dynamic';

/**
 * The follow-up on a signal: who owns it, and whether it is done.
 *
 * Matrix row 9, "Record action / owner", and step 6 of the PMM flow: "Records
 * what should happen next and who owns it, so the follow-up stays visible until
 * marked done."
 *
 * The recommendation text itself lives in `signals.interpretation` and is
 * edited through the interpretation route. This adds the two things that turn a
 * sentence into a commitment - a named person, and a point at which it stops
 * being outstanding.
 *
 * Writes go through the service role because `signals` has no user-facing
 * UPDATE policy; the pipeline owns that table. The role check here is what
 * stands in for one.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireRole(DISTRIBUTORS);
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => ({}))) as {
    action_owner_id?: string | null;
    done?: boolean;
  };

  const update: Record<string, unknown> = {};

  if ('action_owner_id' in body) {
    const owner = body.action_owner_id;
    if (owner !== null && typeof owner !== 'string') {
      return NextResponse.json(
        { error: 'action_owner_id must be a user id or null' },
        { status: 400 }
      );
    }
    update.action_owner_id = owner;
  }

  if ('done' in body) {
    if (typeof body.done !== 'boolean') {
      return NextResponse.json({ error: 'done must be true or false' }, { status: 400 });
    }
    // Reopening clears who closed it as well as when. Leaving a stale
    // `action_done_by` on a reopened item would misattribute the next close.
    update.action_done_at = body.done ? new Date().toISOString() : null;
    update.action_done_by = body.done ? guard.actor.id : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  }

  const db = supabaseServiceRole();
  const { data, error } = await db
    .from('signals')
    .update(update)
    .eq('id', params.id)
    .select('id, action_owner_id, action_done_at, action_done_by');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'That signal no longer exists.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, action: data[0] });
}
