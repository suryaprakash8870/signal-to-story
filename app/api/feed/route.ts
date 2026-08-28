import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest, supabaseServiceRole } from '@/lib/supabase/server';

// Reads request state and live data, so it must never be statically
// evaluated at build time.
export const dynamic = 'force-dynamic';

// The PM feed: competitor updates from the rolling 30-day window.
//
// GET /api/feed                      -> competitor list with counts
// GET /api/feed?competitor=Name      -> that competitor's updates
// GET /api/feed?competitor=X&type=release -> filtered by product-signal type

const WINDOW_DAYS = 30;

function windowStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - WINDOW_DAYS);
  return d.toISOString();
}

export async function GET(req: NextRequest) {
  const supabase = supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const competitor = req.nextUrl.searchParams.get('competitor');
  const type = req.nextUrl.searchParams.get('type');
  const db = supabaseServiceRole();
  const since = windowStart();

  // No competitor selected: return the left-rail list with per-competitor counts.
  if (!competitor) {
    const { data, error } = await db
      .from('competitor_updates')
      .select('competitor_name, id, published_at')
      .gte('published_at', since);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    type Row = { competitor_name: string; id: string; published_at: string };
    type Entry = {
      name: string;
      count: number;
      latest: string;
      ids: string[];
      inCrayon?: boolean;
    };
    const byName = new Map<string, Entry>();
    for (const row of (data ?? []) as Row[]) {
      const entry: Entry = byName.get(row.competitor_name) ?? {
        name: row.competitor_name,
        count: 0,
        latest: row.published_at,
        ids: [],
      };
      entry.count++;
      entry.ids.push(row.id);
      if (row.published_at > entry.latest) entry.latest = row.published_at;
      byName.set(row.competitor_name, entry);
    }

    // Include every competitor on Litera's watchlist, even those with no
    // updates. A PM needs to see that a competitor is being watched but has no
    // recent activity, rather than wondering why it is missing entirely.
    const { data: tracked } = await db
      .from('competitors')
      .select('name, in_crayon')
      .eq('tracked', true);
    for (const c of (tracked ?? []) as { name: string; in_crayon: boolean | null }[]) {
      const existing = byName.get(c.name);
      if (existing) {
        existing.inCrayon = c.in_crayon ?? true;
      } else {
        byName.set(c.name, {
          name: c.name,
          count: 0,
          latest: '',
          ids: [],
          inCrayon: c.in_crayon ?? false,
        });
      }
    }

    // Competitors with recent activity first (newest first), then the quiet
    // ones alphabetically.
    const competitors = [...byName.values()].sort((a, b) => {
      if (a.latest && b.latest) return b.latest.localeCompare(a.latest);
      if (a.latest) return -1;
      if (b.latest) return 1;
      return a.name.localeCompare(b.name);
    });
    return NextResponse.json({ competitors, windowDays: WINDOW_DAYS });
  }

  // A competitor is selected: return its updates, newest first.
  let query = db
    .from('competitor_updates')
    .select(
      'id, competitor_name, update_type, content, source_url, published_at, relevance_note, grounded_document, grounded_section'
    )
    .eq('competitor_name', competitor)
    .gte('published_at', since)
    .order('published_at', { ascending: false });

  if (type && type !== 'all') query = query.eq('update_type', type);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ updates: data ?? [], windowDays: WINDOW_DAYS });
}
