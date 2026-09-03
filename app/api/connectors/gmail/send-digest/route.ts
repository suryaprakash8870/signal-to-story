import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest, supabaseServiceRole } from '@/lib/supabase/server';
import { buildConnector, type ConnectorRow } from '@/lib/connectors/registry';
import { GmailConnector, formatDigest, type DigestItem } from '@/lib/connectors/gmail-connector';

/**
 * Cadence-driven Gmail digest (04-CONNECTORS.md). Batches every approved
 * output not yet sent in a digest, sends one email, and stamps digest_sent_at
 * so they aren't resent. Intended to be triggered by a scheduled GitHub
 * Actions job reading connectors.cadence - also callable manually here for
 * testing. Does NOT send per-signal.
 */
export async function POST(req: NextRequest) {
  // Two ways to authorize: a logged-in user (manual "Send digest now"), or a
  // scheduled job presenting the CRON_SECRET (GitHub Actions). The secret path
  // lets the cron run with no user session; if CRON_SECRET is unset, only the
  // user path works.
  const cronSecret = process.env.CRON_SECRET;
  const presented = req.headers.get('x-cron-secret');
  const isCron = !!cronSecret && presented === cronSecret;

  if (!isCron) {
    const supabase = supabaseForRequest();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const db = supabaseServiceRole();

  const { data: connectorRow, error: connErr } = await db
    .from('connectors')
    .select('*')
    .eq('type', 'gmail')
    .eq('direction', 'outbound')
    .maybeSingle();
  if (connErr || !connectorRow) {
    return NextResponse.json({ error: 'Gmail connector not found' }, { status: 404 });
  }

  // Approved, not yet published to nowhere in particular - specifically not
  // yet included in a digest. Grouped with signal + competitor context.
  const { data: outputs, error: outErr } = await db
    .from('signal_outputs')
    .select('id, audience, output_type, content, signal_id')
    .eq('approved', true)
    .is('digest_sent_at', null);
  if (outErr) return NextResponse.json({ error: outErr.message }, { status: 500 });

  if (!outputs || outputs.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: 'No approved items pending a digest.' });
  }

  // Resolve competitor names per signal for the digest body.
  const signalIds = Array.from(new Set(outputs.map((o) => o.signal_id)));
  const { data: classifications } = await db
    .from('signal_classification')
    .select('signal_id, competitor_id')
    .in('signal_id', signalIds);
  const competitorIds = Array.from(
    new Set((classifications ?? []).map((c) => c.competitor_id).filter(Boolean))
  ) as string[];
  const { data: competitors } = competitorIds.length
    ? await db.from('competitors').select('id, name').in('id', competitorIds)
    : { data: [] as { id: string; name: string }[] };
  const compNameById = new Map((competitors ?? []).map((c) => [c.id, c.name]));
  const compBySignal = new Map(
    (classifications ?? []).map((c) => [c.signal_id, c.competitor_id ? compNameById.get(c.competitor_id) : null])
  );

  const items: DigestItem[] = outputs.map((o) => ({
    audience: o.audience,
    output_type: o.output_type,
    content: o.content,
    competitor: compBySignal.get(o.signal_id) ?? null,
  }));

  const cadence = (connectorRow as ConnectorRow).cadence ?? 'weekly';
  const subject = `Signal-to-Story ${cadence} digest - ${items.length} item${items.length === 1 ? '' : 's'}`;

  try {
    const connector = (await buildConnector(connectorRow as ConnectorRow)) as GmailConnector;
    await connector.sendDigest(subject, formatDigest(items));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'digest send failed' },
      { status: 502 }
    );
  }

  const now = new Date().toISOString();
  const ids = outputs.map((o) => o.id);
  await db.from('signal_outputs').update({ digest_sent_at: now }).in('id', ids);

  return NextResponse.json({ ok: true, sent: items.length, sent_at: now });
}
