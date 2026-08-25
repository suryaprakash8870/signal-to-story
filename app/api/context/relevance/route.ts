import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest } from '@/lib/supabase/server';
import { generateRelevanceNote } from '@/lib/context/relevance';

/**
 * POST { update: string } - generates a "why it matters for us" note for a
 * competitor update, grounded in the context library. Returns the note plus
 * which document section it was grounded in (or null when it stayed general).
 */
export async function POST(req: NextRequest) {
  const supabase = supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { update } = await req.json().catch(() => ({}));
  if (typeof update !== 'string' || !update.trim()) {
    return NextResponse.json({ error: 'update text is required' }, { status: 400 });
  }

  try {
    const result = await generateRelevanceNote(update.trim());
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to generate note' },
      { status: 500 }
    );
  }
}
