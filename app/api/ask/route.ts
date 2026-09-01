import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest } from '@/lib/supabase/server';
import { groundExternalAnswer } from '@/lib/context/relevance';

// The ask box: a natural-language question answered across Crayon's full
// competitive knowledge base.
//
// This is the one surface that reaches past the feed's rolling 30-day window,
// per the PRD, because it queries Crayon directly rather than our stored
// updates. Crayon returns the answer together with source links, so a PM can
// check where each claim came from.

const CRAYON_BASE = 'https://app.crayon.co';

export async function POST(req: NextRequest) {
  const supabase = supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { question } = await req.json().catch(() => ({}));
  if (typeof question !== 'string' || !question.trim()) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 });
  }

  const apiKey = process.env.CRAYON_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Crayon is not configured.' }, { status: 500 });
  }

  try {
    const res = await fetch(`${CRAYON_BASE}/papi/answers/question/`, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ question: question.trim() }),
      // Answers can take a while to compose; allow for it.
      signal: AbortSignal.timeout(90_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return NextResponse.json(
        { error: `Crayon returned ${res.status}. ${body.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const answer = (data.answer as string) ?? '';

    // Crayon's answer knows the competitor but not us. Add what it means for
    // Litera, grounded in our own documents. Null when nothing in the library
    // genuinely applies, in which case the answer stands on its own.
    const grounded = await groundExternalAnswer(question.trim(), answer);

    return NextResponse.json({
      answer,
      sources: (data.sources as { name?: string; url?: string }[]) ?? [],
      relevance: grounded
        ? {
            note: grounded.note,
            documentTitle: grounded.groundedIn?.documentTitle ?? null,
            heading: grounded.groundedIn?.heading ?? null,
          }
        : null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'the question could not be answered' },
      { status: 500 }
    );
  }
}
