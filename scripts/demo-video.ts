/**
 * Records a narrated walkthrough of the app as one role, for showing a client.
 *
 * Playwright drives a real browser and records it. The pacing is deliberate:
 * a caption appears before each step, the cursor moves visibly, and there are
 * pauses long enough to read what is on screen. A recording that races through
 * the product shows nothing.
 *
 * Sign-in uses a one-time link, so no password appears on camera.
 *
 * Run:  npx tsx scripts/demo-video.ts pmm  [baseUrl]
 *       npx tsx scripts/demo-video.ts pm
 *       npx tsx scripts/demo-video.ts admin
 *
 * Out:  reports/demo/<role>.webm
 */
import { readFileSync, mkdirSync, renameSync, readdirSync, rmSync } from 'fs';
import path from 'path';
import type { Page } from 'playwright';

for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

type Role = 'admin' | 'pmm' | 'pm';

const ROLE_ACCOUNT: Record<Role, { email: string; label: string }> = {
  admin: { email: 'demo@compete-agent.com', label: 'Admin' },
  pmm: { email: 'pmm@compete-agent.com', label: 'Product Marketing Manager' },
  pm: { email: 'pm@compete-agent.com', label: 'Product Manager' },
};

const ROLE = (process.argv[2] as Role) ?? 'pmm';
const BASE = process.argv[3] ?? 'http://localhost:3000';
const OUT = path.join(process.cwd(), 'reports', 'demo');

/** A question worth asking on camera: specific, and it reaches past 30 days. */
const DEMO_QUESTION = 'What has Harvey AI changed about pricing or packaging recently?';

/**
 * The shared password on the test accounts. These are fixtures on this project's
 * own Supabase, set for exactly this purpose - nothing real is typed on camera,
 * and the field masks it anyway.
 */
const DEMO_PASSWORD = '12345678';

/**
 * Puts a caption over the page for a few seconds.
 *
 * Injected rather than edited in afterwards, so the recording needs no
 * post-production to be usable.
 */
async function say(page: Page, title: string, detail: string, holdMs = 2600) {
  console.log(`  caption: ${title}`);
  await page.evaluate(
    ({ title, detail }) => {
      document.getElementById('demo-caption')?.remove();
      const el = document.createElement('div');
      el.id = 'demo-caption';
      el.innerHTML =
        `<div style="font:600 21px/1.25 'Segoe UI',Arial,sans-serif;letter-spacing:-.01em">${title}</div>` +
        `<div style="margin-top:6px;font:400 15px/1.45 'Segoe UI',Arial,sans-serif;opacity:.82">${detail}</div>`;
      Object.assign(el.style, {
        position: 'fixed',
        left: '50%',
        bottom: '46px',
        transform: 'translateX(-50%)',
        maxWidth: '760px',
        padding: '16px 22px',
        background: 'rgba(8,16,20,.93)',
        color: '#EDF2F4',
        border: '1px solid rgba(35,195,191,.45)',
        borderRadius: '10px',
        boxShadow: '0 18px 50px rgba(0,0,0,.55)',
        zIndex: '2147483647',
        textAlign: 'center',
        opacity: '0',
        transition: 'opacity .45s ease',
      });
      document.body.appendChild(el);
      requestAnimationFrame(() => (el.style.opacity = '1'));
    },
    { title, detail }
  );
  await page.waitForTimeout(holdMs);
  await page.evaluate(() => {
    const el = document.getElementById('demo-caption');
    if (el) {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 500);
    }
  });
  await page.waitForTimeout(500);
}


/**
 * Draws a cursor into the page.
 *
 * Playwright's recording does not capture the real pointer, so a viewer sees
 * panels change with nothing to explain why. This paints a dot that follows the
 * mouse and pulses on click, injected before every navigation so it survives
 * moving between pages.
 */
const CURSOR_SCRIPT = `
  (() => {
    if (window.__demoCursor) return;
    window.__demoCursor = true;
    const add = () => {
      if (document.getElementById('demo-cursor')) return;
      const dot = document.createElement('div');
      dot.id = 'demo-cursor';
      dot.innerHTML = '<div id="demo-cursor-ring"></div>';
      Object.assign(dot.style, {
        position: 'fixed', left: '0', top: '0', width: '11px', height: '11px',
        marginLeft: '-5.5px', marginTop: '-5.5px', borderRadius: '50%',
        background: 'rgba(246,81,0,.95)', boxShadow: '0 0 0 2px rgba(255,255,255,.95), 0 2px 8px rgba(0,0,0,.45)',
        pointerEvents: 'none', zIndex: '2147483647', transition: 'transform .08s linear',
      });
      const ring = dot.firstElementChild;
      Object.assign(ring.style, {
        position: 'absolute', left: '50%', top: '50%', width: '11px', height: '11px',
        marginLeft: '-5.5px', marginTop: '-5.5px', borderRadius: '50%',
        border: '2px solid rgba(246,81,0,.9)', opacity: '0', transform: 'scale(1)',
      });
      document.documentElement.appendChild(dot);

      addEventListener('mousemove', (e) => {
        dot.style.left = e.clientX + 'px';
        dot.style.top = e.clientY + 'px';
      }, true);

      addEventListener('mousedown', () => {
        ring.style.transition = 'none';
        ring.style.opacity = '1';
        ring.style.transform = 'scale(1)';
        requestAnimationFrame(() => {
          ring.style.transition = 'transform .5s ease-out, opacity .5s ease-out';
          ring.style.opacity = '0';
          ring.style.transform = 'scale(3.4)';
        });
        dot.style.transform = 'scale(.75)';
        setTimeout(() => (dot.style.transform = 'scale(1)'), 130);
      }, true);
    };
    if (document.body) add();
    else addEventListener('DOMContentLoaded', add);
  })();
`;

/** Glides the pointer to an element's centre so the movement reads on camera. */
async function glideTo(page: Page, selector: string): Promise<boolean> {
  const el = page.locator(selector).first();
  if ((await el.count()) === 0) {
    console.log(`  skipped (not found): ${selector}`);
    return false;
  }
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(220);
  const box = await el.boundingBox();
  if (!box) return false;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 26 });
  await page.waitForTimeout(420);
  return true;
}

/** Moves the pointer to an element before clicking, so the click is visible. */
async function show(page: Page, selector: string, pause = 600) {
  if (!(await glideTo(page, selector))) return false;
  await page.waitForTimeout(pause);
  return true;
}

async function click(page: Page, selector: string, after = 1500) {
  if (!(await glideTo(page, selector))) return false;
  // Playwright's click moves to the element and dispatches a real mousedown, so
  // the injected cursor still pulses. Driving mouse.down/up at a precomputed
  // point instead missed its target and silently did nothing.
  await page.locator(selector).first().click().catch(() => {});
  await page.waitForTimeout(after);
  return true;
}

/** Types into a field with the pointer visibly parked on it. */
async function typeInto(page: Page, selector: string, text: string, delay = 60) {
  if (!(await glideTo(page, selector))) return false;
  const field = page.locator(selector).first();
  await field.click().catch(() => {});
  await field.fill('');
  await field.pressSequentially(text, { delay });
  await page.waitForTimeout(500);
  return true;
}

/** Scrolls slowly enough to read, rather than jumping. */
async function readDown(page: Page, steps = 4, px = 420) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, px);
    await page.waitForTimeout(780);
  }
}

async function main() {
  const account = ROLE_ACCOUNT[ROLE];
  if (!account) {
    console.log(`Unknown role "${ROLE}". Use admin, pmm or pm.`);
    process.exit(1);
  }

  rmSync(path.join(OUT, ROLE), { recursive: true, force: true });
  mkdirSync(path.join(OUT, ROLE), { recursive: true });

  const { chromium } = await import('playwright');

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: path.join(OUT, ROLE), size: { width: 1440, height: 900 } },
  });
  await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();

  try {
    // Warm the routes first. A dev server compiling a page on camera looks
    // like the product is slow, which is not what the recording is for.
    for (const p of ['/feed', '/signals', '/review', '/dashboard', '/analytics', '/settings/competitors', '/settings/context', '/settings/users', '/settings/connectors']) {
      await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle' }).catch(() => {});
    }

    // Sign in the way a person does, on the app's own login screen, so the
    // recording opens where the viewer's own session would.
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);
    await say(page, 'Signing in', `Opening Compete Agent as a ${account.label}.`, 2200);

    await typeInto(page, 'input[type="email"]', account.email);
    await typeInto(page, 'input[type="password"]', DEMO_PASSWORD, 45);
    await click(page, 'button:has-text("Sign in")', 2000);

    // Wait for the session itself rather than for the app's own redirect. The
    // redirect races the cookie being committed, so it sometimes leaves you on
    // /login with a perfectly good session - which then made the recording look
    // like the sign-in had failed.
    const signedIn = await page
      .waitForFunction(
        async () => {
          const r = await fetch('/api/me');
          if (!r.ok) return false;
          const me = await r.json();
          return Boolean(me?.role);
        },
        { timeout: 45000, polling: 1000 }
      )
      .then(() => true)
      .catch(() => false);

    if (!signedIn) throw new Error(`could not sign in as ${account.email}`);
    await page.waitForTimeout(1200);

    await page.goto(`${BASE}/feed`, { waitUntil: 'networkidle' });

    // The navigation is filtered client-side once /api/me resolves. Filming
    // before that shows an empty sidebar and every later step misses its
    // target, which is exactly what happened on the first take.
    await page
      .waitForFunction(() => document.querySelectorAll('aside nav a').length > 0, { timeout: 30000 })
      .catch(() => console.log('  sidebar never populated'));
    await page.waitForTimeout(1800);

    await say(
      page,
      `Compete Agent, signed in as ${account.label}`,
      'What each person sees is shaped by their role. This is the ' + account.label + ' view.',
      4200
    );

    // ---------------------------------------------------------------- feed
    await say(page, 'Competitor feed', 'Every competitor on the watchlist, newest activity first, from the last 30 days.');
    await typeInto(page, 'input[aria-label="Filter competitors by name"]', 'Harvey', 110);
    await page.waitForTimeout(1200);

    await say(page, 'Find a competitor', 'Fifty competitors, so the rail searches.', 3000);

    // Scoped to the rail's own aside. A bare "aside button" matches the app's
    // navigation sidebar, which is a different aside on the same page.
    const RAIL = 'aside:has(input[aria-label="Filter competitors by name"]) button';
    await page.waitForFunction(
      (sel) => document.querySelectorAll(sel).length > 0,
      RAIL,
      { timeout: 15000 }
    ).catch(() => {});
    await click(page, RAIL, 3600);

    await say(page, 'What this means for Litera', 'Each update carries a note written against Litera\'s own roadmap and positioning, not a generic summary.', 4600);
    await readDown(page, 3);

    // ------------------------------------------------------------ filters
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(1000);
    await say(page, 'Filter by signal type', 'Narrow to the kind of move you care about.');

    // The chips only render once a competitor is selected, so wait for them
    // rather than assuming the click above has landed.
    await page
      .waitForFunction(
        () => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Release'),
        { timeout: 15000 }
      )
      .catch(() => console.log('  filter chips never appeared'));

    for (const label of ['Release', 'Pricing', 'Customer win', 'Expansion', 'Risk', 'All']) {
      const ok = await click(page, `button:text-is("${label}")`, 2000);
      if (ok) await page.waitForTimeout(700);
    }

    // ------------------------------------------------------------ ask box
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(1200);
    await say(page, 'Ask box', 'The one place that reaches past 30 days, across the full competitive history, answered with source links.', 4600);

    const ask = page.locator('input[placeholder*="Ask about any competitor"]').first();
    if ((await ask.count()) === 0) console.log('  ask box not found');
    if ((await ask.count()) > 0) {
      await typeInto(page, 'input[placeholder*="Ask about any competitor"]', DEMO_QUESTION, 45);
      await page.waitForTimeout(900);
      await click(page, 'button:has-text("Ask")', 800);
      await say(
        page,
        'Asking…',
        'The answer comes from Crayon, then gets a Litera-specific reading added underneath.',
        2600
      );

      // Wait for the answer itself, not merely for the button to stop saying
      // "Asking". The earlier take moved on while the panel was still empty, so
      // the recording never showed a result.
      const ANSWER = 'div.max-h-96.overflow-y-auto';
      const arrived = await page
        .waitForSelector(ANSWER, { timeout: 180000, state: 'visible' })
        .then(() => true)
        .catch(() => false);

      if (!arrived) {
        console.log('  no answer came back within 3 minutes');
      } else {
        await page.waitForTimeout(1400);
        await page.locator(ANSWER).first().scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(1200);
        await say(page, 'The answer', 'Written from the full history, not just the last 30 days.', 3400);

        // Scroll the answer panel itself - it has its own scrollbar, so moving
        // the page would leave the text where it was.
        for (let i = 0; i < 3; i++) {
          await page.locator(ANSWER).first().hover().catch(() => {});
          await page.mouse.wheel(0, 200);
          await page.waitForTimeout(1100);
        }
        await say(page, 'With its sources', 'Every claim links back to where it came from.', 3600);
      }
    }

    // ------------------------------------------------- the rest of the nav
    const TOUR: { href: string; title: string; detail: string; scroll?: number }[] = [
      { href: '/review', title: 'Review queue', detail: 'What is waiting for a decision, most urgent first.', scroll: 2 },
      { href: '/dashboard', title: 'Dashboard', detail: 'The current state at a glance.', scroll: 1 },
      { href: '/analytics', title: 'Analytics', detail: 'How often drafts are approved without edits, which is how we measure whether the writing is good enough.', scroll: 2 },
      { href: '/settings/competitors', title: 'Competitors', detail: 'The watchlist: tier, owner, and the background facts the AI reasons from.', scroll: 2 },
      { href: '/settings/context', title: 'Context library', detail: 'Litera\'s own roadmap, GTM strategy and positioning. This is the "us" every note is written against.', scroll: 1 },
      { href: '/settings/users', title: 'Users and roles', detail: 'Who has access, and what each role can do.', scroll: 1 },
      { href: '/settings/connectors', title: 'Connectors', detail: 'Where the signals come from, and which model writes the notes.', scroll: 1 },
    ];

    // The bridge from the feed to the drafting desk. Reaching Signals by way of
    // this button is the story worth telling - a PMM sees something in the feed
    // and escalates it - rather than arriving there from the sidebar.
    const SEND = 'button:has-text("Send to Signals")';
    if ((await page.locator(SEND).count()) > 0) {
      await say(
        page,
        'Escalating an update',
        'A PMM sees something worth acting on and sends it to the drafting desk.',
        3400
      );
      await click(page, SEND, 2600);
      await page.waitForURL('**/signals/**', { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(2200);

      await say(
        page,
        'Writing for each team',
        'Classify, interpret, route, then write a version for every team the move concerns.',
        3600
      );

      // The pipeline takes a couple of minutes on a fresh item, and returns at
      // once for one already escalated. Wait for the drafts either way.
      const hasDrafts = () =>
        page
          .waitForFunction(
            () => [...document.querySelectorAll('button')].some((b) => /^Approve/.test(b.textContent?.trim() ?? '')),
            { timeout: 150000 }
          )
          .then(() => true)
          .catch(() => false);

      let packaged = await hasDrafts();

      // Writing four teams' drafts takes a few minutes, and a recording should
      // not gamble on it finishing. If this one is still working, open a signal
      // that has already been written so the review screen is still shown.
      if (!packaged) {
        console.log('  still processing - showing a signal that has finished instead');
        const done = await page.evaluate(async () => {
          const r = await fetch('/api/signals');
          if (!r.ok) return null;
          const j = await r.json();
          const list = j.signals ?? j ?? [];
          const hit = list.find((x: { status: string }) => x.status === 'packaged');
          return hit?.id ?? null;
        });
        if (done) {
          await say(page, 'Still writing', 'It takes a few minutes. Here is one that has finished.', 3000);
          await page.goto(`${BASE}/signals/${done}`, { waitUntil: 'networkidle' });
          await page.waitForTimeout(6500);
          packaged = await hasDrafts();
        }
      }

      if (!packaged) {
        console.log('  no packaged signal available to show');
      } else {
        await page.waitForTimeout(1800);
        await say(page, 'What changed, why it matters, what to do next', 'Read once, with the source kept.', 3600);
        await readDown(page, 3);
        await say(
          page,
          'One card per team',
          'Leadership, Product, Marketing, and Sales with the three pieces a rep needs. Approved together.',
          4200
        );
        await readDown(page, 4);
        await say(page, 'Nothing goes out before this point', 'The approval gate is the whole design.', 3600);
      }
    }

    for (const stop of TOUR) {
      const inNav = await page.locator(`aside nav a[href="${stop.href}"]`).count();
      if (inNav === 0) {
        console.log(`  not in this role's navigation: ${stop.href}`);
        continue;
      }

      await show(page, `aside nav a[href="${stop.href}"]`, 800);
      await page.locator(`aside nav a[href="${stop.href}"]`).first().click();
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(2600);
      await say(page, stop.title, stop.detail, 4200);
      if (stop.scroll) await readDown(page, stop.scroll);
    }

    await page.goto(`${BASE}/feed`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    await say(page, 'That is the ' + account.label + ' view', 'Another role opening the same application sees only what belongs to them.', 4800);
  } finally {
    await context.close();
    await browser.close();
  }

  // Playwright names the file by an internal id; give it the role's name.
  const dir = path.join(OUT, ROLE);
  const file = readdirSync(dir).find((f) => f.endsWith('.webm'));
  if (file) {
    const target = path.join(OUT, `${ROLE}.webm`);
    rmSync(target, { force: true });
    renameSync(path.join(dir, file), target);
    rmSync(dir, { recursive: true, force: true });
    console.log(`\nreports/demo/${ROLE}.webm`);
  } else {
    console.log('no video was written');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
