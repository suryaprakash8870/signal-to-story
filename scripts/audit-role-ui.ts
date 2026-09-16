/**
 * Visual permissions audit against section 3 of Dale Harris's "Roles, Access,
 * and User Flows".
 *
 * Drives a real browser as each of the five roles, records what the navigation
 * offers and what each screen actually does, screenshots every page, and writes
 * an illustrated PDF.
 *
 * Sign-in uses a one-time link minted through the Supabase admin API and
 * exchanged on /welcome. No password is typed anywhere, which also means the
 * audit works for accounts nobody has a password for.
 *
 * Two roles have no dedicated account, so a spare PMM account is borrowed for
 * them and put back afterwards - including if the run fails.
 *
 * Run:  npx tsx scripts/audit-role-ui.ts [baseUrl]
 * Out:  reports/role-ui-audit.pdf  (+ reports/shots/*.png)
 */
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import path from 'path';

for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const BASE = process.argv[2] ?? 'http://localhost:3010';
const OUT = path.join(process.cwd(), 'reports');
const SHOTS = path.join(OUT, 'shots');

type Role = 'admin' | 'pmm' | 'pm' | 'consumer' | 'viewer';

/** Which account plays each role. `borrowed` accounts are restored at the end. */
const CAST: { role: Role; email: string; label: string; borrowed?: boolean }[] = [
  { role: 'admin', email: 'demo@compete-agent.com', label: 'Admin' },
  { role: 'pmm', email: 'pmm@compete-agent.com', label: 'PMM (Owner)' },
  { role: 'pm', email: 'pm@compete-agent.com', label: 'Product Manager' },
  { role: 'consumer', email: 'pmm.second@compete-agent.com', label: 'Consumer', borrowed: true },
  { role: 'viewer', email: 'pmm.second@compete-agent.com', label: 'Viewer', borrowed: true },
];

/** The screens, and who the matrix says may reach each one. */
const SCREENS: { path: string; name: string; matrix: string; allowed: Role[] }[] = [
  { path: '/feed', name: 'Competitor feed', matrix: 'Rows 1, 3, 4 - feed, filters, why it matters', allowed: ['admin', 'pmm', 'pm', 'viewer'] },
  { path: '/signals', name: 'Signals', matrix: 'Rows 5, 6 - edit, approve or reject', allowed: ['admin', 'pmm'] },
  { path: '/review', name: 'Review queue', matrix: 'Row 6 - approve or reject', allowed: ['admin', 'pmm'] },
  { path: '/dashboard', name: 'Dashboard', matrix: 'Row 4 - what changed / why / next', allowed: ['admin', 'pmm', 'pm'] },
  { path: '/analytics', name: 'Analytics', matrix: 'Row 14 - approval metrics', allowed: ['admin', 'pmm', 'pm', 'viewer'] },
  { path: '/settings/competitors', name: 'Competitors', matrix: 'Row 10 - competitors, tiers, owners', allowed: ['admin', 'pmm', 'pm'] },
  { path: '/settings/context', name: 'Context library', matrix: 'Grounding documents', allowed: ['admin', 'pmm'] },
  { path: '/settings/users', name: 'Users and roles', matrix: 'Row 13 - manage users and roles', allowed: ['admin'] },
  { path: '/settings/connectors', name: 'Connectors & AI', matrix: 'Rows 11, 12 - connectors, delivery', allowed: ['admin'] },
];

/** What the sidebar should offer each role. */
const EXPECTED_NAV: Record<Role, string[]> = {
  admin: ['/signals', '/feed', '/review', '/dashboard', '/analytics', '/settings/competitors', '/settings/context', '/settings/users', '/settings/connectors'],
  pmm: ['/signals', '/feed', '/review', '/dashboard', '/analytics', '/settings/competitors', '/settings/context'],
  pm: ['/feed', '/dashboard', '/analytics', '/settings/competitors'],
  viewer: ['/feed', '/analytics'],
  consumer: [],
};

interface Finding {
  role: Role;
  roleLabel: string;
  screen: string;
  matrix: string;
  expected: 'visible' | 'blocked';
  actual: 'visible' | 'blocked';
  pass: boolean;
  shot: string;
  note: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });

  const { createClient } = await import('@supabase/supabase-js');
  const { chromium } = await import('playwright');

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const { data: list } = await db.auth.admin.listUsers();
  const idByEmail = new Map((list?.users ?? []).map((u) => [u.email ?? '', u.id]));
  const { data: profiles } = await db.from('user_profiles').select('id, role');
  const originalRole = new Map((profiles ?? []).map((p) => [p.id as string, p.role as string]));

  const borrowedIds = new Set(CAST.filter((c) => c.borrowed).map((c) => idByEmail.get(c.email)!));
  const restore = async () => {
    for (const id of borrowedIds) {
      await db.from('user_profiles').update({ role: originalRole.get(id) ?? 'pmm' }).eq('id', id);
    }
  };

  const findings: Finding[] = [];
  const navRows: { role: Role; label: string; expected: string[]; actual: string[]; pass: boolean; shot: string }[] = [];

  const browser = await chromium.launch();

  try {
    // Compile the routes before measuring anything. Next builds each page on
    // first request in dev, and the first role tested would otherwise absorb
    // all of that latency and time out mid-render.
    const warm = await (await browser.newContext()).newPage();
    for (const screen of [{ path: '/feed' }, ...SCREENS]) {
      await warm.goto(`${BASE}${screen.path}`, { waitUntil: 'networkidle' }).catch(() => {});
    }
    await warm.close();
    console.log('routes warmed\n');

    for (const member of CAST) {
      const userId = idByEmail.get(member.email);
      if (!userId) {
        console.log(`  skipped ${member.label} - no account for ${member.email}`);
        continue;
      }

      // A borrowed account is switched to the role under test.
      if (member.borrowed) {
        await db.from('user_profiles').update({ role: member.role }).eq('id', userId);
      }

      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();

      // Sign in through a one-time link. No password involved.
      const { data: link } = await db.auth.admin.generateLink({ type: 'magiclink', email: member.email });
      const hash = (link as { properties?: { hashed_token?: string } } | null)?.properties?.hashed_token;
      if (!hash) throw new Error(`could not mint a link for ${member.email}`);

      await page.goto(`${BASE}/welcome?token_hash=${hash}&type=magiclink`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);

      const me = await page.evaluate(() => fetch('/api/me').then((r) => (r.ok ? r.json() : null)));
      const seenRole = (me as { role?: string } | null)?.role;
      console.log(`\n${member.label}  (signed in as ${seenRole ?? 'nobody'})`);

      // ---- the sidebar ----
      await page.goto(`${BASE}/feed`, { waitUntil: 'networkidle' });

      // The navigation is filtered client-side once /api/me resolves, so a
      // fixed pause races a cold dev server: read too early and a correct
      // sidebar looks empty. Wait for the role label the footer renders, which
      // only appears after that call lands. A Consumer legitimately has no nav
      // items, so waiting for links instead would never settle.
      await page
        .waitForFunction(
          () => {
            const aside = document.querySelector('aside');
            return (
              !!aside &&
              /Admin|Product Marketing Manager|Product Manager|Consumer|Viewer/.test(
                (aside as HTMLElement).innerText
              )
            );
          },
          { timeout: 45000 }
        )
        .catch(() => console.log('  (sidebar role label never appeared)'));

      const actualNav: string[] = await page.evaluate(() =>
        [...document.querySelectorAll('aside nav a')].map((a) => a.getAttribute('href') ?? '')
      );
      const expectedNav = EXPECTED_NAV[member.role];
      const navPass =
        actualNav.length === expectedNav.length && expectedNav.every((h) => actualNav.includes(h));

      const navShot = `nav-${member.role}.png`;
      await page.screenshot({ path: path.join(SHOTS, navShot), fullPage: false });
      navRows.push({ role: member.role, label: member.label, expected: expectedNav, actual: actualNav, pass: navPass, shot: navShot });
      console.log(`  sidebar: ${actualNav.length} item(s) ${navPass ? 'OK' : 'MISMATCH'}`);

      // ---- each screen ----
      for (const screen of SCREENS) {
        await page.goto(`${BASE}${screen.path}`, { waitUntil: 'networkidle' });

        // Client-rendered screens show a loading state before they know the
        // caller's role, and a denial only appears after that resolves. Reading
        // during the spinner reported a correctly blocked page as visible.
        await page
          .waitForFunction(() => !/^\s*Loading/m.test(document.body.innerText), { timeout: 20000 })
          .catch(() => {});
        await page.waitForTimeout(600);

        // A blocked screen says so in the markup. Matching the prose instead
        // was fragile - the review page's wording differed from the others, so
        // a correctly blocked page was reported as a leak.
        const blocked = await page.evaluate(() => {
          if (document.querySelector('[data-access-denied]')) return true;
          const text = document.body.innerText;
          return /only available to an admin|Only an admin can|need access/i.test(text);
        });
        const actual: 'visible' | 'blocked' = blocked ? 'blocked' : 'visible';
        const expected: 'visible' | 'blocked' = screen.allowed.includes(member.role) ? 'visible' : 'blocked';

        const shot = `${member.role}${screen.path.replace(/\//g, '-')}.png`;
        await page.screenshot({ path: path.join(SHOTS, shot), fullPage: false });

        findings.push({
          role: member.role,
          roleLabel: member.label,
          screen: screen.name,
          matrix: screen.matrix,
          expected,
          actual,
          pass: expected === actual,
          shot,
          note: blocked ? 'Refused with a message' : 'Screen rendered',
        });
        if (expected !== actual) {
          const snippet = (await page.evaluate(() => document.body.innerText))
            .replace(/\s+/g, ' ')
            .slice(0, 120);
          console.log(`  FAIL  ${screen.name.padEnd(20)} expected ${expected}, got ${actual}  |  ${snippet}`);
        } else {
          console.log(`  PASS  ${screen.name.padEnd(20)} expected ${expected}, got ${actual}`);
        }
      }

      await context.close();
      if (member.borrowed) await restore();
    }

    // ------------------------------------------------------------- the report
    const passed = findings.filter((f) => f.pass).length;
    const failed = findings.length - passed;
    const navPassed = navRows.filter((n) => n.pass).length;

    const html = buildReport({ findings, navRows, passed, failed, navPassed });
    writeFileSync(path.join(OUT, 'role-ui-audit.html'), html, 'utf8');

    const page = await (await browser.newContext()).newPage();
    await page.goto('file:///' + path.join(OUT, 'role-ui-audit.html').replace(/\\/g, '/'), { waitUntil: 'networkidle' });
    await page.pdf({
      path: path.join(OUT, 'role-ui-audit.pdf'),
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
    });

    console.log(`\n${passed} passed, ${failed} failed across ${findings.length} screen checks`);
    console.log(`${navPassed} of ${navRows.length} sidebars match`);
    console.log(`\nreports/role-ui-audit.pdf`);
  } finally {
    await restore();
    await browser.close();
  }
}

function buildReport(d: {
  findings: Finding[];
  navRows: { role: Role; label: string; expected: string[]; actual: string[]; pass: boolean; shot: string }[];
  passed: number;
  failed: number;
  navPassed: number;
}): string {
  const label = (h: string) => h.replace('/settings/', '').replace('/', '') || h;

  const navSection = d.navRows
    .map(
      (n) => `
  <div class="role">
    <h3>${esc(n.label)} <span class="tag ${n.pass ? 'ok' : 'bad'}">${n.pass ? 'matches' : 'mismatch'}</span></h3>
    <table class="kv">
      <tr><th>Expected</th><td>${n.expected.length ? n.expected.map(label).map(esc).join(' · ') : '<em>nothing</em>'}</td></tr>
      <tr><th>Actual</th><td>${n.actual.length ? n.actual.map(label).map(esc).join(' · ') : '<em>nothing</em>'}</td></tr>
    </table>
    <img src="shots/${n.shot}" />
  </div>`
    )
    .join('');

  const byRole = new Map<string, Finding[]>();
  for (const f of d.findings) {
    if (!byRole.has(f.roleLabel)) byRole.set(f.roleLabel, []);
    byRole.get(f.roleLabel)!.push(f);
  }

  const detail = [...byRole.entries()]
    .map(
      ([roleLabel, fs]) => `
  <div class="role break">
    <h2>${esc(roleLabel)}</h2>
    <table class="grid">
      <thead><tr><th>Screen</th><th>Matrix</th><th>Expected</th><th>Actual</th><th>Result</th></tr></thead>
      <tbody>
        ${fs
          .map(
            (f) => `<tr>
              <td><strong>${esc(f.screen)}</strong></td>
              <td class="muted">${esc(f.matrix)}</td>
              <td>${f.expected}</td>
              <td>${f.actual}</td>
              <td class="${f.pass ? 'ok' : 'bad'}">${f.pass ? 'PASS' : 'FAIL'}</td>
            </tr>`
          )
          .join('')}
      </tbody>
    </table>
    <div class="shots">
      ${fs.map((f) => `<figure><img src="shots/${f.shot}" /><figcaption>${esc(f.screen)} — ${f.actual}</figcaption></figure>`).join('')}
    </div>
  </div>`
    )
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Role access audit</title>
<style>
  @page { size: A4; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #14232c; font-size: 11px; line-height: 1.5; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 26px 0 8px; border-bottom: 2px solid #14232c; padding-bottom: 4px; }
  h3 { font-size: 13px; margin: 16px 0 6px; }
  .sub { color: #5b7280; margin: 0 0 18px; }
  .summary { display: flex; gap: 10px; margin: 14px 0 22px; }
  .card { border: 1px solid #d9e2e8; border-radius: 6px; padding: 10px 14px; }
  .card b { display: block; font-size: 20px; }
  table { border-collapse: collapse; width: 100%; }
  .grid th, .grid td { border: 1px solid #d9e2e8; padding: 5px 7px; text-align: left; vertical-align: top; }
  .grid th { background: #f2f6f8; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
  .kv th { text-align: left; width: 80px; padding: 3px 6px 3px 0; color: #5b7280; font-weight: 600; }
  .kv td { padding: 3px 0; }
  .muted { color: #5b7280; }
  .ok { color: #0f7b4f; font-weight: 700; }
  .bad { color: #b3261e; font-weight: 700; }
  .tag { font-size: 10px; padding: 1px 6px; border-radius: 10px; border: 1px solid currentColor; }
  img { width: 100%; border: 1px solid #d9e2e8; border-radius: 4px; margin-top: 6px; }
  .shots { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
  figure { margin: 0; break-inside: avoid; }
  figcaption { font-size: 9.5px; color: #5b7280; margin-top: 3px; }
  .break { break-before: page; }
  .role { break-inside: avoid; }
</style></head><body>
  <h1>Role access audit</h1>
  <p class="sub">Compete Agent, tested against section 3 of &ldquo;Roles, Access, and User Flows&rdquo;.<br>
  Each role signed in to a real browser; every screen opened and photographed. ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>

  <div class="summary">
    <div class="card"><b>${d.passed}</b>checks passed</div>
    <div class="card"><b class="${d.failed ? 'bad' : 'ok'}">${d.failed}</b>failed</div>
    <div class="card"><b>${d.navPassed}/${d.navRows.length}</b>sidebars correct</div>
  </div>

  <h2>What each role is offered in the sidebar</h2>
  ${navSection}

  ${detail}
</body></html>`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
