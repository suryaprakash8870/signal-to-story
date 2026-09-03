import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest, supabaseServiceRole } from '@/lib/supabase/server';
import { buildConnector, type ConnectorRow } from '@/lib/connectors/registry';

/**
 * Runs the connector's testConnection() and records the result in
 * connectors.status. For Teams this posts a real "connection test" message
 * to the channel - the only way to verify an Incoming Webhook actually works.
 */
export async function POST(_req: NextRequest, { params }: { params: { type: string } }) {
  const supabase = supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const db = supabaseServiceRole();
  const { data: connectorRow, error } = await db
    .from('connectors')
    .select('*')
    .eq('type', params.type)
    .maybeSingle();
  if (error || !connectorRow) {
    return NextResponse.json({ error: 'connector not found' }, { status: 404 });
  }

  let result: { ok: boolean; message?: string };
  try {
    const connector = await buildConnector(connectorRow as ConnectorRow);
    result = await connector.testConnection();
  } catch (err) {
    result = { ok: false, message: err instanceof Error ? err.message : String(err) };
  }

  await db
    .from('connectors')
    .update({ status: result.ok ? 'connected' : 'error', updated_at: new Date().toISOString() })
    .eq('id', connectorRow.id);

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
