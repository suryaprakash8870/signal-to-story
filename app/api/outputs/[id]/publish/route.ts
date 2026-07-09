import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest, supabaseServiceRole } from '@/lib/supabase/server';
import { buildConnector, type ConnectorRow } from '@/lib/connectors/registry';
import type { OutboundPayload } from '@/lib/connectors/connector';

/**
 * Stage 6 — Distribution. Only fires after approval (04-CONNECTORS.md).
 * Pushes an approved output to Teams and stamps published_at. The
 * approved-gate is enforced two ways: RLS already blocked approval while
 * unverified_claims were present, and this route refuses to publish
 * anything not marked approved.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // Read the output through the caller's session so RLS applies.
  const { data: output, error: outputErr } = await supabase
    .from('signal_outputs')
    .select('id, signal_id, audience, output_type, content, approved, published_at, reviewed_by')
    .eq('id', params.id)
    .single();
  if (outputErr || !output) {
    return NextResponse.json({ error: outputErr?.message ?? 'not found' }, { status: 404 });
  }
  if (!output.approved) {
    return NextResponse.json({ error: 'Output must be approved before publishing.' }, { status: 409 });
  }
  if (output.published_at) {
    return NextResponse.json({ error: 'Output already published.' }, { status: 409 });
  }

  // Gather context for the message (competitor name, signal excerpt).
  const { data: signal } = await supabase
    .from('signals')
    .select('raw_text, source_type')
    .eq('id', output.signal_id)
    .single();

  const { data: classification } = await supabase
    .from('signal_classification')
    .select('competitor_id, urgency')
    .eq('signal_id', output.signal_id)
    .maybeSingle();

  let competitor: string | null = null;
  if (classification?.competitor_id) {
    const { data: comp } = await supabase
      .from('competitors')
      .select('name')
      .eq('id', classification.competitor_id)
      .maybeSingle();
    competitor = comp?.name ?? null;
  }

  // Who approved it (for the card footer) — full_name, else the email local part.
  let approverName: string | null = null;
  if (output.reviewed_by) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('full_name')
      .eq('id', output.reviewed_by)
      .maybeSingle();
    approverName = profile?.full_name ?? null;
  }
  if (!approverName) {
    const { data: { user: reviewer } } = await supabase.auth.getUser();
    approverName = reviewer?.email ? reviewer.email.split('@')[0] : 'a reviewer';
  }

  // Distribution and the published_at stamp are backend actions — use the
  // service role, same as the pipeline stages.
  const db = supabaseServiceRole();
  const { data: connectorRow, error: connErr } = await db
    .from('connectors')
    .select('*')
    .eq('type', 'teams')
    .eq('direction', 'outbound')
    .maybeSingle();
  if (connErr || !connectorRow) {
    return NextResponse.json({ error: 'Teams connector is not configured.' }, { status: 400 });
  }

  const payload: OutboundPayload = {
    audience: output.audience,
    output_type: output.output_type,
    content: output.content,
    competitor,
    signal_excerpt: signal?.raw_text?.slice(0, 240),
    urgency: classification?.urgency ?? null,
    source_type: signal?.source_type ?? null,
    approved_by_name: approverName,
    published_date: new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
  };

  try {
    const connector = await buildConnector(connectorRow as ConnectorRow);
    await connector.push!(payload);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'publish failed' },
      { status: 502 }
    );
  }

  const now = new Date().toISOString();
  const { error: stampErr } = await db
    .from('signal_outputs')
    .update({ published_at: now })
    .eq('id', output.id);
  if (stampErr) {
    return NextResponse.json({ error: `posted, but failed to stamp: ${stampErr.message}` }, { status: 500 });
  }
  await db.from('signals').update({ status: 'published' }).eq('id', output.signal_id);

  return NextResponse.json({ ok: true, published_at: now });
}
