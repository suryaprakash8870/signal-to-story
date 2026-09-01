import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Session-scoped client — respects RLS as the calling user. Use this for
 * anything a submitter/reviewer/admin does through the UI.
 */
export function supabaseForRequest() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: CookieToSet[]) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

/**
 * Service-role client — bypasses RLS. Pipeline stages write classification
 * and packaged outputs directly (per 01-DATA-MODEL.md, these are pipeline
 * outputs, not user input), so this is the only client that may write to
 * signal_classification / advance signals.status outside of insert.
 * Server-side only — never import this from client components.
 */
// One service-role client for the whole process, created on first use.
//
// This was previously constructed fresh on every call. Each client carries its
// own connection pool, so a code path making several reads in a row (resolving
// the LLM backend reads config five or six times) could open enough sockets to
// exhaust the pool and hang indefinitely rather than erroring. The client holds
// no per-request state - `persistSession: false` means no auth session is
// stored - so reusing one is both safe and the documented pattern.
// Built through a factory so the client keeps its fully inferred type; naming
// the type as ReturnType<typeof createClient> instead would drop the generic
// parameters and every query would type as `never`.
function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

let serviceRoleClient: ReturnType<typeof createServiceRoleClient> | null = null;

export function supabaseServiceRole() {
  serviceRoleClient ??= createServiceRoleClient();
  return serviceRoleClient;
}
