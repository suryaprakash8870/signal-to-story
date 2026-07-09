import { readFileSync } from 'fs';
import path from 'path';
for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
async function main() {
  const backend = process.argv[2] ?? 'cloudflare';
  const { supabaseServiceRole } = await import('../lib/supabase/server');
  const db = supabaseServiceRole();
  const { error } = await db
    .from('llm_config')
    .update({ selected_backend: backend, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) throw new Error(error.message);
  const { data } = await db.from('llm_config').select('selected_backend').eq('id', 1).single();
  console.log('pinned backend =', data?.selected_backend);
}
main().catch((e) => { console.error(e); process.exit(1); });
