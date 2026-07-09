import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest } from '@/lib/supabase/server';

type KnownFact = { fact: string; source: string; added_by?: string; added_at?: string };

// POST: append a fact to a competitor's known_facts array. Shape per
// 01-DATA-MODEL.md — each fact is independently citable by the grounding step.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { fact, source } = await req.json();
  if (typeof fact !== 'string' || !fact.trim()) {
    return NextResponse.json({ error: 'fact is required' }, { status: 400 });
  }

  const { data: comp, error: readErr } = await supabase
    .from('competitors')
    .select('known_facts')
    .eq('id', params.id)
    .single();
  if (readErr || !comp) {
    return NextResponse.json({ error: readErr?.message ?? 'not found' }, { status: 404 });
  }

  const facts: KnownFact[] = comp.known_facts ?? [];
  facts.push({
    fact: fact.trim(),
    source: typeof source === 'string' && source.trim() ? source.trim() : 'internal',
    added_by: user.id,
    added_at: new Date().toISOString().slice(0, 10),
  });

  const { error: writeErr } = await supabase
    .from('competitors')
    .update({ known_facts: facts, updated_at: new Date().toISOString() })
    .eq('id', params.id);
  if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 403 });

  return NextResponse.json({ ok: true, count: facts.length });
}

// DELETE: remove a fact by index.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supabaseForRequest();
  const { fact_index } = await req.json();
  if (typeof fact_index !== 'number') {
    return NextResponse.json({ error: 'fact_index (number) is required' }, { status: 400 });
  }

  const { data: comp, error: readErr } = await supabase
    .from('competitors')
    .select('known_facts')
    .eq('id', params.id)
    .single();
  if (readErr || !comp) {
    return NextResponse.json({ error: readErr?.message ?? 'not found' }, { status: 404 });
  }

  const facts: KnownFact[] = comp.known_facts ?? [];
  if (fact_index < 0 || fact_index >= facts.length) {
    return NextResponse.json({ error: 'fact_index out of range' }, { status: 400 });
  }
  facts.splice(fact_index, 1);

  const { error: writeErr } = await supabase
    .from('competitors')
    .update({ known_facts: facts, updated_at: new Date().toISOString() })
    .eq('id', params.id);
  if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 403 });

  return NextResponse.json({ ok: true, count: facts.length });
}
