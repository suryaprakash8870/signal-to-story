import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Pages that don't require a session.
const PUBLIC_PATHS = ['/login'];

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Refreshes the Supabase session on every request (so an active user isn't
 * silently logged out when the 1-hour access token expires) and redirects
 * unauthenticated users to /login instead of letting them hit a confusing
 * "unauthenticated" error at submit time. API routes are left alone — they
 * return their own 401 for fetch() callers.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: CookieToSet[]) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', path);
    return NextResponse.redirect(url);
  }

  // Already signed in but sitting on /login → send to intake.
  if (user && path.startsWith('/login')) {
    const url = request.nextUrl.clone();
    url.pathname = '/intake';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Run on all page routes except Next internals, /api (which enforces its own
  // auth), and static asset files. Public images (e.g. /2.jpg, /litera-logo.png)
  // must be excluded or the auth redirect bounces them to /login and they fail
  // to load on unauthenticated pages like the login screen itself.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)).*)',
  ],
};
