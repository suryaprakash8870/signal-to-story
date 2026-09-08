import { readFileSync } from 'fs'; import path from 'path';
for (const l of readFileSync(path.join(process.cwd(),'.env.local'),'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
(async () => {
  const { supabaseServiceRole } = await import('../lib/supabase/server');
  const db = supabaseServiceRole();
  const s = new Date(); s.setDate(s.getDate()-30); const iso = s.toISOString();
  const w = await db.from('competitor_updates').select('*',{count:'exact',head:true}).gte('published_at',iso);
  const n = await db.from('competitor_updates').select('*',{count:'exact',head:true}).gte('published_at',iso).not('relevance_note','is',null);
  console.log(`${n.count} of ${w.count} have notes. ${(w.count??0)-(n.count??0)} still to go.`);
})().catch(e=>{console.error(e);process.exit(1);});
