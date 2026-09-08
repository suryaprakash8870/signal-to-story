/**
 * Authorization tests for the Phase 1 role model.
 *
 * Proves the two rules in Dale Harris's "Roles, Access, and User Flows":
 *   1. Only the PMM who owns a competitor may approve or distribute its content.
 *   2. Research rights are separate from distribution rights, so a PM can
 *      explore the feed but can never push anything out.
 *
 * Both layers are exercised, because they are genuinely separate defences:
 *   - the row-level policies, hit with a real signed-in user's token
 *   - the route guards, hit over HTTP against the running dev server
 *
 * No passwords are involved. Sessions come from the admin magic-link API, which
 * mints a token for an existing account without one.
 *
 * The distribution tests deliberately run against an UNAPPROVED output. A
 * caller who passes the ownership guard then stops at "must be approved first",
 * which proves the guard let them through without actually posting anything to
 * a Teams channel or sending an email.
 *
 * Fixtures are created and removed. Roles and competitor ownership are recorded
 * before the run and restored afterwards, including on failure.
 *
 * Run:  npx tsx scripts/test-roles.ts [baseUrl]
 */
import { readFileSync } from 'fs';
import path from 'path';

for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const BASE_URL = process.argv[2] ?? 'http://localhost:3010';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// The four accounts the tests act as. These already exist in the project as
// fixtures; nothing is created and nothing is signed up for.
const ACTORS = {
  admin: 'demo@compete-agent.com',
  owner: 'test-reviewer-a@example.com',
  other: 'test-reviewer-b@example.com',
  pm: 'test-submitter@example.com',
} as const;
type ActorKey = keyof typeof ACTORS;

const TEST_COMPETITOR = 'RBAC Test Co';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

/**
 * Builds the Cookie header the app's own server client will accept.
 *
 * Hand-rolling this was wrong: @supabase/ssr encodes the session as base64url
 * (not plain base64) and splits it across numbered cookies once it exceeds
 * ~3KB, which a session carrying the user object always does. So the library
 * writes the cookies here, into an in-memory jar, exactly as it would in a
 * browser. Whatever the encoding is, it matches by construction.
 */
async function cookieHeaderFor(session: {
  access_token: string;
  refresh_token: string;
}): Promise<string> {
  const { createServerClient } = await import('@supabase/ssr');
  const jar = new Map<string, string>();

  const client = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (list: { name: string; value: string }[]) => {
        for (const { name, value } of list) jar.set(name, value);
      },
    },
  });

  const { error } = await client.auth.setSession(session);
  if (error) throw new Error(`could not store session: ${error.message}`);
  if (jar.size === 0) throw new Error('the client wrote no cookies');

  return [...jar.entries()].map(([n, v]) => `${n}=${v}`).join('; ');
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // ---------------------------------------------------------------- preflight
  console.log('Preflight\n');

  const { data: list } = await admin.auth.admin.listUsers();
  const idByEmail = new Map((list?.users ?? []).map((u) => [u.email ?? '', u.id]));
  const missing = Object.values(ACTORS).filter((e) => !idByEmail.has(e));
  if (missing.length) {
    console.log(`  Cannot run: these accounts do not exist -- ${missing.join(', ')}`);
    process.exit(1);
  }

  const { data: profiles } = await admin.from('user_profiles').select('id, role');
  const roleById = new Map((profiles ?? []).map((p) => [p.id as string, p.role as string]));
  const legacy = [...roleById.values()].filter((r) => r === 'reviewer' || r === 'submitter');
  if (legacy.length) {
    console.log(
      `  Cannot run: ${legacy.length} account(s) still hold a pre-migration role.\n` +
        '  Apply supabase/migrations/0019_dale_role_model.sql first.'
    );
    process.exit(1);
  }
  check('migration 0019 applied (no legacy roles remain)', true);

  // Record everything this run changes, so it can be put back.
  const originalRoles = new Map<ActorKey, string>();
  for (const [key, email] of Object.entries(ACTORS) as [ActorKey, string][]) {
    originalRoles.set(key, roleById.get(idByEmail.get(email)!) ?? 'pm');
  }

  const cleanups: (() => Promise<void>)[] = [];

  try {
    // ------------------------------------------------------------- fixtures
    const wanted: Record<ActorKey, string> = { admin: 'admin', owner: 'pmm', other: 'pmm', pm: 'pm' };
    for (const [key, role] of Object.entries(wanted) as [ActorKey, string][]) {
      await admin.from('user_profiles').update({ role }).eq('id', idByEmail.get(ACTORS[key])!);
    }
    cleanups.push(async () => {
      for (const [key, role] of originalRoles) {
        await admin.from('user_profiles').update({ role }).eq('id', idByEmail.get(ACTORS[key])!);
      }
    });

    const ownerId = idByEmail.get(ACTORS.owner)!;
    const { data: comp } = await admin
      .from('competitors')
      .upsert({ name: TEST_COMPETITOR, owner_id: ownerId }, { onConflict: 'name' })
      .select('id')
      .single();
    const competitorId = (comp as { id: string }).id;
    cleanups.push(async () => {
      await admin.from('competitors').delete().eq('id', competitorId);
    });

    const { data: signal } = await admin
      .from('signals')
      .insert({ raw_text: `RBAC fixture ${Date.now()}`, source_type: 'manual', source_ref: 'test-roles' })
      .select('id')
      .single();
    const signalId = (signal as { id: string }).id;
    cleanups.push(async () => {
      await admin.from('signals').delete().eq('id', signalId);
    });

    await admin.from('signal_classification').insert({
      signal_id: signalId,
      competitor_id: competitorId,
      signal_type: 'product_launch',
      business_area: 'drafting',
      urgency: 'low',
      audience_relevance: { sales: true },
    });

    const { data: output } = await admin
      .from('signal_outputs')
      .insert({
        signal_id: signalId,
        audience: 'sales',
        output_type: 'talk_track',
        content: 'RBAC fixture output.',
        unverified_claims: [],
      })
      .select('id')
      .single();
    const outputId = (output as { id: string }).id;

    console.log(`  fixture: competitor owned by ${ACTORS.owner}, one unapproved output\n`);

    // ------------------------------------------------------- mint sessions
    const sessions = new Map<ActorKey, { access_token: string; refresh_token: string }>();
    for (const [key, email] of Object.entries(ACTORS) as [ActorKey, string][]) {
      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email,
      });
      const hashed = (link as { properties?: { hashed_token?: string } } | null)?.properties
        ?.hashed_token;
      if (linkErr || !hashed) throw new Error(`no magic link for ${email}: ${linkErr?.message}`);

      const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
      const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
        token_hash: hashed,
        type: 'magiclink',
      });
      if (verifyErr || !verified.session) {
        throw new Error(`could not mint a session for ${email}: ${verifyErr?.message}`);
      }
      sessions.set(key, {
        access_token: verified.session.access_token,
        refresh_token: verified.session.refresh_token,
      });
    }

    const cookieHeaders = new Map<ActorKey, string>();
    for (const key of Object.keys(ACTORS) as ActorKey[]) {
      cookieHeaders.set(key, await cookieHeaderFor(sessions.get(key)!));
    }

    const call = (actor: ActorKey | null, url: string, init: RequestInit = {}) =>
      fetch(`${BASE_URL}${url}`, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          ...(actor ? { cookie: cookieHeaders.get(actor)! } : {}),
        },
      });

    // ------------------------------------------------ 1. sessions are real
    console.log('Identity');
    for (const key of Object.keys(ACTORS) as ActorKey[]) {
      const res = await call(key, '/api/me');
      const body = await res.json().catch(() => ({}));
      check(`${key} is recognised as ${wanted[key]}`, res.status === 200 && body.role === wanted[key],
        `got ${res.status} ${JSON.stringify(body).slice(0, 80)}`);
    }
    const anonMe = await call(null, '/api/me');
    check('no session is rejected', anonMe.status === 401, `got ${anonMe.status}`);

    // ---------------------------------------- 2. rule two: PM cannot distribute
    console.log('\nRule two: research rights are not distribution rights');

    const pmPublish = await call('pm', `/api/outputs/${outputId}/publish`, { method: 'POST' });
    check('PM cannot publish to Teams', pmPublish.status === 403, `got ${pmPublish.status}`);

    const pmEmail = await call('pm', `/api/outputs/${outputId}/publish-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: 'nobody@example.com' }),
    });
    check('PM cannot send by email', pmEmail.status === 403, `got ${pmEmail.status}`);

    const pmUsers = await call('pm', '/api/users?scope=all');
    check('PM cannot list users and roles', pmUsers.status === 403, `got ${pmUsers.status}`);

    const pmFeed = await call('pm', '/api/feed');
    check('PM CAN read the competitor feed', pmFeed.status === 200, `got ${pmFeed.status}`);

    // -------------------------------- 3. rule one: only the owner distributes
    console.log('\nRule one: only the owning PMM distributes');

    const otherPublish = await call('other', `/api/outputs/${outputId}/publish`, { method: 'POST' });
    check('a PMM who does not own this competitor cannot publish',
      otherPublish.status === 403, `got ${otherPublish.status}`);

    // The owner should get PAST the ownership guard and stop at the approval
    // gate, which proves authorisation without posting anything anywhere.
    const ownerPublish = await call('owner', `/api/outputs/${outputId}/publish`, { method: 'POST' });
    const ownerBody = await ownerPublish.json().catch(() => ({}));
    check('the owning PMM passes the ownership guard (stops at "not approved")',
      ownerPublish.status === 409, `got ${ownerPublish.status} ${JSON.stringify(ownerBody).slice(0, 90)}`);

    const adminPublish = await call('admin', `/api/outputs/${outputId}/publish`, { method: 'POST' });
    check('an admin passes the ownership guard too',
      adminPublish.status === 409, `got ${adminPublish.status}`);

    // ------------------------------- 4. the same rule in the database policies
    console.log('\nThe row-level policies, independently of the routes');

    const asUser = (key: ActorKey) =>
      createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${sessions.get(key)!.access_token}` } },
      });

    const pmApprove = await asUser('pm')
      .from('signal_outputs')
      .update({ approved: true })
      .eq('id', outputId)
      .select('id');
    check('PM approval is refused by the policy',
      (pmApprove.data ?? []).length === 0, `changed ${(pmApprove.data ?? []).length} row(s)`);

    const otherApprove = await asUser('other')
      .from('signal_outputs')
      .update({ approved: true })
      .eq('id', outputId)
      .select('id');
    check('non-owner PMM approval is refused by the policy',
      (otherApprove.data ?? []).length === 0, `changed ${(otherApprove.data ?? []).length} row(s)`);

    const ownerApprove = await asUser('owner')
      .from('signal_outputs')
      .update({ approved: true })
      .eq('id', outputId)
      .select('id');
    check('the owning PMM CAN approve',
      (ownerApprove.data ?? []).length === 1, `changed ${(ownerApprove.data ?? []).length} row(s)`);

    // ------------------------------------- 5. the rest of the capability matrix
    console.log('\nThe capability matrix, row by row');

    const pmCompetitors = await call('pm', '/api/competitors');
    check('row 10: PM reads the competitor list', pmCompetitors.status === 200,
      `got ${pmCompetitors.status}`);

    const pmCreateCompetitor = await call('pm', '/api/competitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Should Not Exist' }),
    });
    check('row 10: PM cannot add a competitor', pmCreateCompetitor.status === 403,
      `got ${pmCreateCompetitor.status}`);

    const pmmTier = await call('owner', `/api/competitors/${competitorId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: 1 }),
    });
    check('row 10: PMM cannot change tier or owner (Admin manages the watchlist)',
      pmmTier.status === 403, `got ${pmmTier.status}`);

    const ownerFact = await call('owner', `/api/competitors/${competitorId}/facts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fact: 'RBAC fixture fact', source: 'test' }),
    });
    check('the owning PMM CAN add a known fact to their own competitor',
      ownerFact.status === 200, `got ${ownerFact.status}`);

    const otherFact = await call('other', `/api/competitors/${competitorId}/facts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fact: 'Should not land', source: 'test' }),
    });
    check('a PMM who does not own it cannot add a known fact',
      otherFact.status === 403, `got ${otherFact.status}`);

    const pmAnalytics = await call('pm', '/api/analytics');
    check('row 14: PM reads analytics', pmAnalytics.status === 200, `got ${pmAnalytics.status}`);

    const pmAsk = await call('pm', '/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    check('row 2: PM reaches the Ask Box (400 for a missing question, not 403)',
      pmAsk.status === 400, `got ${pmAsk.status}`);

    console.log('\nRow 9: record action and owner');

    const pmAssign = await call('pm', `/api/signals/${signalId}/action`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_owner_id: ownerId }),
    });
    check('a PM cannot assign a follow-up', pmAssign.status === 403, `got ${pmAssign.status}`);

    const assign = await call('owner', `/api/signals/${signalId}/action`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_owner_id: ownerId }),
    });
    check('a PMM assigns the follow-up', assign.status === 200, `got ${assign.status}`);

    const markDone = await call('owner', `/api/signals/${signalId}/action`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: true }),
    });
    const doneBody = await markDone.json().catch(() => ({}));
    check('marking it done records who closed it',
      markDone.status === 200 && Boolean(doneBody.action?.action_done_at) &&
        doneBody.action?.action_done_by === ownerId,
      JSON.stringify(doneBody).slice(0, 110));

    const reopen = await call('owner', `/api/signals/${signalId}/action`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: false }),
    });
    const reopenBody = await reopen.json().catch(() => ({}));
    check('reopening clears both who closed it and when',
      reopen.status === 200 && reopenBody.action?.action_done_at === null &&
        reopenBody.action?.action_done_by === null,
      JSON.stringify(reopenBody).slice(0, 110));

    // ----------------- 6. the manual path: an account added outside the invite
    console.log('\nAdding people by hand');

    const everyone = await call('admin', '/api/users?scope=all');
    const everyoneBody = await everyone.json().catch(() => ({}));
    const listedIds = new Set(((everyoneBody.users ?? []) as { id: string }[]).map((u) => u.id));
    const accountIds = (list?.users ?? []).map((u) => u.id);
    check('every account appears on the Users screen, profile row or not',
      accountIds.every((id) => listedIds.has(id)),
      `${listedIds.size} listed of ${accountIds.length} accounts`);

    // Delete a profile row to simulate an account whose signup trigger never
    // fired, then prove an admin can still see it and give it a role.
    const strandedId = idByEmail.get(ACTORS.pm)!;
    await admin.from('user_profiles').delete().eq('id', strandedId);
    cleanups.push(async () => {
      await admin
        .from('user_profiles')
        .upsert({ id: strandedId, role: originalRoles.get('pm') ?? 'pm' }, { onConflict: 'id' });
    });

    const stranded = await call('admin', '/api/users?scope=all');
    const strandedBody = await stranded.json().catch(() => ({}));
    const strandedRow = ((strandedBody.users ?? []) as { id: string; role: string | null }[]).find(
      (u) => u.id === strandedId
    );
    check('an account with no profile row is still listed, with no role',
      Boolean(strandedRow) && strandedRow?.role === null,
      JSON.stringify(strandedRow ?? null).slice(0, 90));

    const assignStranded = await call('admin', '/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: strandedId, role: 'pmm' }),
    });
    check('an admin can give that account a role (the row is created)',
      assignStranded.status === 200, `got ${assignStranded.status}`);

    const { data: recreated } = await admin
      .from('user_profiles')
      .select('role')
      .eq('id', strandedId)
      .maybeSingle();
    check('and the role really landed',
      (recreated as { role?: string } | null)?.role === 'pmm',
      JSON.stringify(recreated ?? null));

    const ghost = await call('admin', '/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: '00000000-0000-0000-0000-000000000000', role: 'pmm' }),
    });
    check('a role cannot be given to an account that does not exist',
      ghost.status === 404, `got ${ghost.status}`);

    // ---------------------------------------------- 7. inviting from the screen
    console.log('\nInviting from the Users screen');

    const pmInvite = await call('pm', '/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', role: 'pm' }),
    });
    check('a PM cannot invite anyone', pmInvite.status === 403, `got ${pmInvite.status}`);

    const pmmInvite = await call('owner', '/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', role: 'pm' }),
    });
    check('a PMM cannot invite anyone either', pmmInvite.status === 403, `got ${pmmInvite.status}`);

    const badEmail = await call('admin', '/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', role: 'pm' }),
    });
    check('an invalid address is refused', badEmail.status === 400, `got ${badEmail.status}`);

    const badRole = await call('admin', '/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'someone@example.com', role: 'wizard' }),
    });
    check('an invalid role is refused', badRole.status === 400, `got ${badRole.status}`);

    // Deliberately NOT tested: a successful invite. It would create a real
    // account and send a real email to whatever address the test named.
    const duplicate = await call('admin', '/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ACTORS.pm, role: 'pm' }),
    });
    check('inviting someone who already has an account is refused, not duplicated',
      duplicate.status === 409, `got ${duplicate.status}`);

    const welcome = await fetch(`${BASE_URL}/welcome`);
    check('the invitation landing page is reachable without a session',
      welcome.status === 200, `got ${welcome.status}`);

    const pmResend = await call('pm', '/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ACTORS.other, role: 'pmm', resend: true }),
    });
    check('a PM cannot resend an invitation either', pmResend.status === 403,
      `got ${pmResend.status}`);

    // ------------------------- 8. the refusal is reported, not silently ignored
    console.log('\nA refused write is reported as a refusal');

    await admin.from('signal_outputs').update({ approved: false }).eq('id', outputId);
    const pmApproveHttp = await call('pm', `/api/outputs/${outputId}/approve`, { method: 'PATCH' });
    const pmApproveBody = await pmApproveHttp.json().catch(() => ({}));
    check('a blocked approval returns 403, not a false success',
      pmApproveHttp.status === 403, `got ${pmApproveHttp.status} ${JSON.stringify(pmApproveBody).slice(0, 90)}`);

    const { data: after } = await admin
      .from('signal_outputs')
      .select('approved')
      .eq('id', outputId)
      .single();
    check('and the output really did stay unapproved',
      (after as { approved: boolean }).approved === false);
  } finally {
    for (const undo of cleanups.reverse()) {
      await undo().catch(() => {});
    }
    console.log('\nfixtures removed, roles and ownership restored');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
