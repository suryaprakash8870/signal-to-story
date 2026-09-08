import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest } from '@/lib/supabase/server';
import { DISTRIBUTORS, type Role } from '@/lib/auth/roles';
import { ingestCompetitorUpdates } from '@/lib/feed/ingest';

/**
 * POST: pull the latest Crayon Sparks and store the individual updates inside
 * them. Deduped, so calling this repeatedly only adds genuinely new updates.
 * Reviewer/admin only.
 */
export async function POST(req: NextRequest) {
  // Authorized either by a reviewer/admin pressing "Refresh from Crayon", or by
  // the CRON_SECRET so the daily scheduled job can run with no user session.
  // Same pattern as the connector fetch endpoint.
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && req.headers.get('x-cron-secret') === cronSecret;

  if (!isCron) {
    const supabase = supabaseForRequest();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!DISTRIBUTORS.includes(profile?.role as Role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  try {
    const result = await ingestCompetitorUpdates();

    // A refresh where every note failed used to report plain success. Say so
    // instead, in words a PM can act on, while still returning the updates that
    // were ingested successfully.
    const warning =
      result.notesFailed > 0
        ? `${result.notesGenerated} notes generated, ${result.notesFailed} could not be: ${result.noteErrors[0] ?? 'unknown reason'}`
        : null;

    return NextResponse.json({ ok: true, warning, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'refresh failed' },
      { status: 500 }
    );
  }
}
