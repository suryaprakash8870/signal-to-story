import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest, supabaseServiceRole } from '@/lib/supabase/server';
import { generateRelevanceNote } from '@/lib/context/relevance';

/**
 * POST: generate (or regenerate) the "why it matters for us" note for one
 * update, grounded in the context library. The note is cached on the row, so
 * the feed does not re-run the model every time a PM opens it.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const db = supabaseServiceRole();
  const { data: update, error: readErr } = await db
    .from('competitor_updates')
    .select('id, competitor_name, content, relevance_note')
    .eq('id', params.id)
    .maybeSingle();
  if (readErr || !update) {
    return NextResponse.json({ error: readErr?.message ?? 'update not found' }, { status: 404 });
  }

  try {
    const result = await generateRelevanceNote(
      `Competitor: ${update.competitor_name}\n\n${update.content}`
    );

    const { error: writeErr } = await db
      .from('competitor_updates')
      .update({
        relevance_note: result.note,
        grounded_document: result.groundedIn?.documentTitle ?? null,
        grounded_section: result.groundedIn?.heading ?? null,
        note_generated_at: new Date().toISOString(),
      })
      .eq('id', params.id);
    if (writeErr) throw new Error(writeErr.message);

    return NextResponse.json({
      ok: true,
      note: result.note,
      groundedIn: result.groundedIn,
      general: result.general,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'note generation failed' },
      { status: 500 }
    );
  }
}
