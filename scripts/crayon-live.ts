/**
 * Sets the Crayon inbound connector to Live Mode (so the fetch route uses the
 * real API with the env CRAYON_API_KEY). Run once to enable live Crayon pulls.
 *
 * Run:  npx tsx scripts/crayon-live.ts
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
  const { data, error } = await db
    .from('connectors')
    .update({ mode: 'live', status: 'connected' })
    .eq('type', 'crayon')
    .eq('direction', 'inbound')
    .select('type, mode, status');
  if (error) throw new Error(error.message);
  console.log('Crayon connector set:', data);
}
main().catch((e) => { console.error(e); process.exit(1); });
