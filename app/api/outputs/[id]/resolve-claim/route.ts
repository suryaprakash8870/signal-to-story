import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest } from '@/lib/supabase/server';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supabaseForRequest();
  const { claim_index, action } = await req.json();
  if (typeof claim_index !== 'number' || (action !== 'confirm' && action !== 'remove')) {
    return NextResponse.json({ error: 'claim_index (number) and action ("confirm"|"remove") required' }, { status: 400 });
  }

  const { data: output, error: fetchErr } = await supabase
    .from('signal_outputs')
    .select('unverified_claims, content')
    .eq('id', params.id)
    .single();
  if (fetchErr || !output) {
    return NextResponse.json({ error: fetchErr?.message ?? 'not found' }, { status: 404 });
  }

  const claims: string[] = output.unverified_claims ?? [];
  if (claim_index < 0 || claim_index >= claims.length) {
    return NextResponse.json({ error: 'claim_index out of range' }, { status: 400 });
  }

  const claim = claims[claim_index];
  const remainingClaims = claims.filter((_, i) => i !== claim_index);
  // "Confirm" moves the claim into the main content, now backed by human
  // judgment, per 05-HUMAN-REVIEW-WORKFLOW.md — "remove" just drops it.
  const newContent = action === 'confirm' ? `${output.content}\n\n${claim}` : output.content;

  const { error: updateErr } = await supabase
    .from('signal_outputs')
    .update({ unverified_claims: remainingClaims, content: newContent })
    .eq('id', params.id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, remaining: remainingClaims.length });
}
