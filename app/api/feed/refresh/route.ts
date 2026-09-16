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
    // Pull from Crayon and store what is new. This is seconds of work, so the
    // caller gets an answer straight away and the new items appear in the feed.
    const result = await ingestCompetitorUpdates(50, { generateNotes: false });

    // Notes are written afterwards, without the caller waiting. Two model
    // calls each means a backlog runs for hours; holding the request open for
    // that is what made the Refresh button appear to hang forever.
    const { pregenerateNotes } = await import('@/lib/feed/ingest');
    pregenerateNotes()
      .then((n) => {
        if (n.failed > 0) {
          console.warn(`[feed/refresh] ${n.generated} notes written, ${n.failed} failed: ${n.errors[0] ?? ''}`);
        } else {
          console.log(`[feed/refresh] ${n.generated} notes written`);
        }
      })
      .catch((err) => console.error('[feed/refresh] note generation failed:', err));

    // How many updates are still waiting for a note, so the screen can say so
    // rather than leaving blank cards unexplained.
    const { supabaseServiceRole } = await import('@/lib/supabase/server');
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const { count: pendingNotes } = await supabaseServiceRole()
      .from('competitor_updates')
      .select('*', { count: 'exact', head: true })
      .gte('published_at', since.toISOString())
      .is('relevance_note', null);

    return NextResponse.json({ ok: true, warning: null, pendingNotes: pendingNotes ?? 0, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'refresh failed' },
      { status: 500 }
    );
  }
}
