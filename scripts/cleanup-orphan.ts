import { readFileSync } from 'fs';
import path from 'path';
for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
async function main() {
  const { supabaseServiceRole } = await import('../lib/supabase/server');
  const db = supabaseServiceRole();
  const { data } = await db
    .from('signals')
    .delete()
    .eq('id', '50826267-d55f-4afa-bd5a-85f8831dd270')
    .select('id');
  console.log('deleted orphan:', data);
}
main().catch((e) => { console.error(e); process.exit(1); });
