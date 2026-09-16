/**
 * Prints a one-time sign-in link for any existing account, so each role can be
 * tested in a browser without knowing or setting a password.
 *
 * The link goes through /welcome, which exchanges the token in the browser.
 * That is the same path an invitation takes, so it is also a live check of the
 * invitation flow.
 *
 * Run:  npx tsx scripts/signin-as.ts pmm@compete-agent.com
 *       npx tsx scripts/signin-as.ts            (lists everyone and their role)
 *
 * Development only. It uses the service-role key, which is why it is a script
 * and not an endpoint.
 */
import { readFileSync } from 'fs';
import path from 'path';

for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const BASE = process.env.APP_URL?.replace(/\/$/, '') ?? 'http://localhost:3010';

async function main() {
  const email = process.argv[2];
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const { data: list } = await db.auth.admin.listUsers();
  const { data: profiles } = await db.from('user_profiles').select('id, role');
  const roleById = new Map((profiles ?? []).map((p) => [p.id as string, p.role as string]));

  if (!email) {
    console.log('Accounts:\n');
    for (const u of list?.users ?? []) {
      console.log(`  ${(roleById.get(u.id) ?? 'no role').padEnd(9)} ${u.email}`);
    }
    console.log('\nRun again with an email to get a sign-in link.');
    return;
  }

  const user = (list?.users ?? []).find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase());
  if (!user) {
    console.log(`No account for ${email}.`);
    process.exit(1);
  }

  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email });
  const hash = (data as { properties?: { hashed_token?: string } } | null)?.properties?.hashed_token;
  if (error || !hash) {
    console.log(`Could not create a link: ${error?.message ?? 'no token returned'}`);
    process.exit(1);
  }

  console.log(`\n${email}  (${roleById.get(user.id) ?? 'no role'})\n`);
  console.log(`${BASE}/welcome?token_hash=${hash}&type=magiclink\n`);
  console.log('Open it in a private window so it does not replace your own session.');
  console.log('It works once. Run this again for another.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
