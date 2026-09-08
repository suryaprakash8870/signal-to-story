import { NextRequest, NextResponse } from 'next/server';
import { supabaseServiceRole } from '@/lib/supabase/server';
import { canEditFacts, currentActor } from '@/lib/auth/roles';

type KnownFact = { fact: string; source: string; added_by?: string; added_at?: string };

/**
 * An admin, or the PMM who owns this competitor.
 *
 * The write goes through the service role afterwards. Since migration 0020 the
 * row-level policy on `competitors` admits admins only, and it cannot express
 * "a PMM may change this one column" - row-level security is row-level, not
 * column-level. So the ownership rule lives here, and this route is the only
 * path that writes known facts.
 */
async function guardFacts(competitorId: string) {
  const actor = await currentActor();
  if (!actor) {
    return { ok: false as const, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  }
  if (!(await canEditFacts(actor, competitorId))) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Only an admin, or the PMM who owns this competitor, can change its known facts.' },
        { status: 403 }
      ),
    };
  }
  return { ok: true as const, actor };
}

// POST: append a fact to a competitor's known_facts array. Shape per
// 01-DATA-MODEL.md - each fact is independently citable by the grounding step.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await guardFacts(params.id);
  if (!guard.ok) return guard.response;
  const supabase = supabaseServiceRole();

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
    added_by: guard.actor.id,
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
  const guard = await guardFacts(params.id);
  if (!guard.ok) return guard.response;
  const supabase = supabaseServiceRole();

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
