import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest, supabaseServiceRole } from '@/lib/supabase/server';
import { getBrevoConfig, sendBrevoEmail } from '@/lib/email/brevo';

const OUTPUT_TYPE_LABELS: Record<string, string> = {
  talk_track: 'Talk track',
  battlecard_snippet: 'Battlecard',
  live_talking_points: 'Live talking points',
  watchout: 'Watch-out',
  marketing_angle: 'Marketing angle',
  leadership_summary: 'Leadership summary',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A separate Stage 6 distribution action, alongside the Teams publish route:
 * emails one approved output via Brevo to a recipient the reviewer types in at
 * publish time (05-HUMAN-REVIEW-WORKFLOW.md's approval gate still applies —
 * only approved outputs may be sent). Independent of the Teams publish flow;
 * either or both channels may be used for the same output.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const to = typeof body?.to === 'string' ? body.to.trim() : '';
  if (!to || !EMAIL_RE.test(to)) {
    return NextResponse.json({ error: 'A valid recipient email is required.' }, { status: 400 });
  }

  const config = getBrevoConfig();
  if (!config) {
    return NextResponse.json(
      { error: 'Brevo is not configured (missing BREVO_API_KEY / BREVO_SENDER_EMAIL).' },
      { status: 400 }
    );
  }

  // Read through the caller's session so RLS applies, same as the Teams route.
  const { data: output, error: outputErr } = await supabase
    .from('signal_outputs')
    .select('id, signal_id, audience, output_type, content, approved')
    .eq('id', params.id)
    .single();
  if (outputErr || !output) {
    return NextResponse.json({ error: outputErr?.message ?? 'not found' }, { status: 404 });
  }
  if (!output.approved) {
    return NextResponse.json({ error: 'Output must be approved before publishing.' }, { status: 409 });
  }

  const { data: signal } = await supabase
    .from('signals')
    .select('raw_text, source_type')
    .eq('id', output.signal_id)
    .single();

  const { data: classification } = await supabase
    .from('signal_classification')
    .select('competitor_id')
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

  const label = OUTPUT_TYPE_LABELS[output.output_type] ?? output.output_type;
  const subject = `Signal-to-Story — ${label} (${output.audience})${competitor ? ` · ${competitor}` : ''}`;
  const lines = [
    `Audience: ${output.audience}`,
    `Type: ${label}`,
    competitor ? `Competitor: ${competitor}` : null,
    signal?.source_type ? `Source: ${signal.source_type}` : null,
    '',
    output.content,
  ].filter((l): l is string => l !== null);
  const text = lines.join('\n');

  try {
    await sendBrevoEmail(config, { to, subject, text });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'email send failed' },
      { status: 502 }
    );
  }

  // Distribution/status stamping is a backend action — service role, matching
  // the Teams route. Only stamp published_at if this is the first channel to
  // publish it; email may also be sent for an output already published via Teams.
  const db = supabaseServiceRole();
  const now = new Date().toISOString();
  const { data: current } = await db
    .from('signal_outputs')
    .select('published_at')
    .eq('id', output.id)
    .maybeSingle();
  if (!current?.published_at) {
    await db.from('signal_outputs').update({ published_at: now }).eq('id', output.id);
    await db.from('signals').update({ status: 'published' }).eq('id', output.signal_id);
  }

  return NextResponse.json({ ok: true, sent_to: to });
}
