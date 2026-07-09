import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest } from '@/lib/supabase/server';

/**
 * Published outputs for the dashboard, filterable by audience, competitor, and
 * date range. Selects only the columns the dashboard renders — never `select *`
 * on signal_outputs, which grows large over time (10-OPTIMIZATION-NOTES.md).
 */
export async function GET(req: NextRequest) {
  const supabase = supabaseForRequest();
  const { searchParams } = new URL(req.url);
  const audience = searchParams.get('audience');
  const competitor = searchParams.get('competitor');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  let query = supabase
    .from('signal_outputs')
    .select('id, audience, output_type, content, published_at, signal_id')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false });

  if (audience) query = query.eq('audience', audience);
  if (from) query = query.gte('published_at', from);
  if (to) query = query.lte('published_at', `${to}T23:59:59`);

  const { data: outputs, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const signalIds = Array.from(new Set((outputs ?? []).map((o) => o.signal_id)));
  const idFilter = signalIds.length ? signalIds : ['00000000-0000-0000-0000-000000000000'];

  const [{ data: signals }, { data: classifications }, { data: competitors }] = await Promise.all([
    supabase.from('signals').select('id, source_type').in('id', idFilter),
    supabase.from('signal_classification').select('signal_id, competitor_id').in('signal_id', idFilter),
    supabase.from('competitors').select('id, name'),
  ]);

  const sourceBySignal = new Map((signals ?? []).map((s) => [s.id, s.source_type]));
  const compIdBySignal = new Map((classifications ?? []).map((c) => [c.signal_id, c.competitor_id]));
  const nameById = new Map((competitors ?? []).map((c) => [c.id, c.name]));

  let rows = (outputs ?? []).map((o) => {
    const compId = compIdBySignal.get(o.signal_id);
    return {
      id: o.id,
      audience: o.audience,
      output_type: o.output_type,
      content: o.content,
      published_at: o.published_at,
      signal_id: o.signal_id,
      source_type: sourceBySignal.get(o.signal_id) ?? null,
      competitor: compId ? nameById.get(compId) ?? null : null,
    };
  });

  // Competitor filter is applied here (name resolves through classification).
  if (competitor) rows = rows.filter((r) => r.competitor === competitor);

  return NextResponse.json({
    outputs: rows,
    competitors: (competitors ?? []).map((c) => c.name),
  });
}
