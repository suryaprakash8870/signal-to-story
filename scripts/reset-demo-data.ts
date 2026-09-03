/**
 * Wipes all test/demo signal data so the app looks fresh for a client screen
 * recording. Deletes signals (cascades to signal_classification and
 * signal_outputs) and the test competitors created during development.
 * Does NOT touch: user accounts, connectors, LLM/backend config, Vault
 * secrets - only signal-related content.
 *
 * Run:  npx tsx scripts/reset-demo-data.ts
 */
import { readFileSync } from 'fs';
import path from 'path';
for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function main() {
  const { supabaseServiceRole } = await import('../lib/supabase/server');
  const db = supabaseServiceRole();

  const { count: signalsBefore } = await db.from('signals').select('*', { count: 'exact', head: true });
  const { count: outputsBefore } = await db.from('signal_outputs').select('*', { count: 'exact', head: true });
  const { count: compsBefore } = await db.from('competitors').select('*', { count: 'exact', head: true });
  console.log('BEFORE:', { signals: signalsBefore, outputs: outputsBefore, competitors: compsBefore });

  // Deleting signals cascades to signal_classification + signal_outputs (FKs
  // are ON DELETE CASCADE - see supabase/migrations/0001_init.sql).
  const { error: sigErr } = await db.from('signals').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (sigErr) throw new Error(`failed to delete signals: ${sigErr.message}`);

  const { error: compErr } = await db.from('competitors').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (compErr) throw new Error(`failed to delete competitors: ${compErr.message}`);

  const { count: signalsAfter } = await db.from('signals').select('*', { count: 'exact', head: true });
  const { count: outputsAfter } = await db.from('signal_outputs').select('*', { count: 'exact', head: true });
  const { count: compsAfter } = await db.from('competitors').select('*', { count: 'exact', head: true });
  console.log('AFTER:', { signals: signalsAfter, outputs: outputsAfter, competitors: compsAfter });
  console.log('\nDemo data cleared. Accounts, connectors, and LLM config were left untouched.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
