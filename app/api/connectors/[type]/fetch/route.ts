import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest, supabaseServiceRole } from '@/lib/supabase/server';
import { buildConnector, type ConnectorRow } from '@/lib/connectors/registry';
import { runPipeline, rerunSignal, findExistingSignalByText } from '@/lib/pipeline/orchestrate';

/**
 * Runs an inbound connector's fetch() and pushes each returned candidate
 * through the pipeline as a new signal. In Test Mode this reads the fixture
 * for that connector (08-TEST-FIXTURES-AND-TESTING.md) - real, working
 * behavior, clearly labeled as Test Mode in the UI.
 */
export async function POST(req: NextRequest, { params }: { params: { type: string } }) {
  // Authorize by a logged-in user (manual "Fetch now") OR the CRON_SECRET, so
  // a scheduled polling job (GitHub Actions) can run without a user session.
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && req.headers.get('x-cron-secret') === cronSecret;

  let submittedBy: string | null = null;
  if (!isCron) {
    const supabase = supabaseForRequest();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    submittedBy = user.id;
  }

  const db = supabaseServiceRole();
  const { data: connectorRow, error } = await db
    .from('connectors')
    .select('*')
    .eq('type', params.type)
    .eq('direction', 'inbound')
    .maybeSingle();
  if (error || !connectorRow) {
    return NextResponse.json({ error: 'inbound connector not found' }, { status: 404 });
  }

  let candidates;
  try {
    const connector = await buildConnector(connectorRow as ConnectorRow);
    if (!connector.fetch) {
      return NextResponse.json({ error: 'connector does not support fetch' }, { status: 400 });
    }
    candidates = await connector.fetch();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'fetch failed' },
      { status: 502 }
    );
  }

  // Crayon signals land as PENDING (status 'draft') and are NOT auto-processed -
  // the reviewer runs each through the pipeline manually via the "Process" button
  // on the Signals page. This keeps AI load controlled (Crayon can return 20+
  // Sparks at once). Other connectors still auto-run on fetch.
  const isManual = params.type === 'crayon';

  const created: string[] = [];
  const deduped: string[] = [];
  for (const candidate of candidates) {
    const existing = await findExistingSignalByText(candidate.raw_text);
    if (existing) {
      // Re-run a prior errored fetch (auto connectors only); dedupe otherwise.
      if (!isManual && existing.status === 'error') {
        await rerunSignal(existing.id);
        created.push(existing.id);
      } else {
        deduped.push(existing.id);
      }
      continue;
    }
    const { data: signal, error: insertErr } = await db
      .from('signals')
      .insert({
        raw_text: candidate.raw_text,
        source_type: candidate.source_type,
        source_ref: candidate.source_ref,
        source_links: candidate.source_links ?? null,
        submitted_by: submittedBy,
      })
      .select('id')
      .single();
    if (insertErr || !signal) continue;
    created.push(signal.id);
    if (!isManual) {
      runPipeline(signal.id).catch((e) => console.error('[pipeline] unhandled error:', e));
    }
  }

  return NextResponse.json({ ok: true, created, deduped });
}
