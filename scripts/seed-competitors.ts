/**
 * Seeds Litera's Phase One competitor watchlist, and records which of them
 * Crayon actually has data for.
 *
 * Litera's list and Crayon's watchlist are different sets. This script makes
 * Litera's list authoritative: every name below is created as a tracked
 * competitor, and anything already in the table that is NOT on the list is
 * marked untracked rather than deleted (its history stays intact).
 *
 * Run:  npx tsx scripts/seed-competitors.ts
 */
import { readFileSync } from 'fs';
import path from 'path';

for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

// Litera's Phase One list, as supplied by the client.
const LITERA_COMPETITORS = [
  'Aderant', 'Anthropic', 'Avvoka', 'Ayora', 'BEC Legal Systems', 'BigHand',
  'BoostDraft', 'BriefCatch', 'Clio', 'ContractPodAi', 'Dealcloser', 'DeepJudge',
  'Definely', 'Diligent', 'DocStyle', 'Draftable', 'DraftWise', 'eBrevia',
  'Entegrata', 'Epona', 'Gavel', 'Harvey', 'Hebbia', 'HSO Proserv',
  'iCompli by LegalRM', 'iManage', 'Intapp', 'Introhive', 'Juro', 'LawMatics',
  'Legal BI', 'Legatics', 'Legora', 'LexisNexis', 'Luminance',
  'Microsoft Power Platform', 'MyMai', 'NetDocuments', 'Nexl', 'Noetica',
  'Novaplex', 'Orbital Witness', 'Passle', 'Relativity', 'Salesforce CRM',
  'SimplyAgree', 'Spellbook', 'SurePoint Technologies', 'Thomson Reuters Legal',
  'Vuture',
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

async function main() {
  const { supabaseServiceRole } = await import('../lib/supabase/server');
  const db = supabaseServiceRole();

  // Which competitors does Crayon actually hold data for? Battlecards give the
  // full watchlist; sparks give those with recent activity.
  const key = process.env.CRAYON_API_KEY;
  const crayonNames = new Set<string>();
  if (key) {
    const headers = { 'X-API-KEY': key, Accept: 'application/json' };
    const bc = await fetch('https://app.crayon.co/papi/battlecards/', { headers });
    if (bc.ok) {
      for (const b of (await bc.json()) as { competitor?: { name?: string } }[]) {
        if (b.competitor?.name) crayonNames.add(norm(b.competitor.name));
      }
    }
    const sp = await fetch('https://app.crayon.co/papi/sparks/?live_tiles_only=true&page=1&per_page=200', { headers });
    if (sp.ok) {
      for (const s of (await sp.json()) as { competitors?: { name?: string }[] }[]) {
        for (const c of s.competitors ?? []) if (c.name) crayonNames.add(norm(c.name));
      }
    }
  }
  console.log(`Crayon holds data for ${crayonNames.size} competitors.`);

  // Upsert each of Litera's competitors as tracked.
  let created = 0;
  let updated = 0;
  for (const name of LITERA_COMPETITORS) {
    const inCrayon = crayonNames.has(norm(name));
    const { data: existing } = await db
      .from('competitors')
      .select('id')
      .eq('name', name)
      .maybeSingle();

    if (existing) {
      await db
        .from('competitors')
        .update({ tracked: true, in_crayon: inCrayon, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      updated++;
    } else {
      const { error } = await db
        .from('competitors')
        .insert({ name, tracked: true, in_crayon: inCrayon });
      if (error) console.log(`  could not create ${name}: ${error.message}`);
      else created++;
    }
  }

  // Anything in the table that is not on Litera's list is marked untracked, so
  // it stops appearing in the feed without losing its stored history.
  const listedNames = new Set(LITERA_COMPETITORS.map(norm));
  const { data: all } = await db.from('competitors').select('id, name');
  let untracked = 0;
  for (const c of (all ?? []) as { id: string; name: string }[]) {
    if (!listedNames.has(norm(c.name))) {
      await db.from('competitors').update({ tracked: false }).eq('id', c.id);
      untracked++;
    }
  }

  const { data: final } = await db
    .from('competitors')
    .select('name, tracked, in_crayon')
    .eq('tracked', true);
  const withData = (final ?? []).filter((c) => c.in_crayon).length;

  console.log(`\ncreated ${created}, updated ${updated}, marked untracked ${untracked}`);
  console.log(`tracked competitors: ${(final ?? []).length}`);
  console.log(`  with Crayon data:    ${withData}`);
  console.log(`  awaiting Crayon:     ${(final ?? []).length - withData}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
