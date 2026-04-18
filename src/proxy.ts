import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Public routes that don't require authentication
const PUBLIC_PATHS = [
  '/api/auth',
  '/api/cron',
  '/api/webhooks',
  '/api/_client-error',
  '/login',
  '/privacy',
  '/terms',
  '/unsubscribe',
  '/paywall',
  '/_next',
  '/sw.js',
  '/manifest.json',
  '/icons',
];

// API paths that require auth but should never be subscription-gated
// (payment flow + settings + health checks)
const SUB_EXEMPT_API = [
  '/api/auth',
  '/api/subscription',
  '/api/stripe',
  '/api/webhooks',
  '/api/account',
  '/api/push',
  '/api/health',
  '/api/settings',
];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Quick server-side subscription check. Uses Supabase REST with the service
 * role key (works in Edge runtime). Returns `hasAccess` for the user.
 * Cached per-instance in a Map so middleware doesn't hit Supabase on every
 * sub-resource request during a page load.
 */
const accessCache = new Map<string, { value: boolean; ts: number }>();
const ACCESS_TTL_MS = 60_000;

async function checkAccess(userId: string): Promise<boolean> {
  const cached = accessCache.get(userId);
  if (cached && Date.now() - cached.ts < ACCESS_TTL_MS) return cached.value;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return true; // fail-open if misconfigured

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/users?id=eq.${userId}&select=is_admin,is_premium,trial_ends_at,subscription_end&limit=1`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        // cache: don't let the CDN cache this between users
        cache: 'no-store',
      }
    );
    if (!r.ok) return true; // fail-open on errors so the app is never fully locked by a Supabase blip
    const rows = await r.json() as Array<{ is_admin?: boolean; is_premium?: boolean; trial_ends_at?: string | null; subscription_end?: string | null }>;
    const u = rows?.[0];
    if (!u) return true;
    if (u.is_admin) {
      accessCache.set(userId, { value: true, ts: Date.now() });
      return true;
    }
    const now = Date.now();
    const trialActive = u.trial_ends_at && new Date(u.trial_ends_at).getTime() > now;
    const subActive = u.is_premium && u.subscription_end && new Date(u.subscription_end).getTime() > now;
    const hasAccess = Boolean(trialActive || subActive);
    accessCache.set(userId, { value: hasAccess, ts: Date.now() });
    return hasAccess;
  } catch {
    return true; // fail-open
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (
    pathname === '/' ||
    pathname === '/favicon.ico' ||
    PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  // Check for valid session token
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  // Protect API routes with 401 instead of redirect
  if (pathname.startsWith('/api/') && !token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Redirect unauthenticated users to login
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Subscription gate — belt AND braces with the client-side guard.
  // - For API routes: return 402 JSON (exempting payment / settings / auth / health).
  // - For pages: redirect to /paywall.
  // Fetches subscription state from Supabase via the service role key (Edge-safe).
  const userId = (token as unknown as { userId?: string })?.userId;
  if (userId) {
    const isApi = pathname.startsWith('/api/');
    const isExemptApi = isApi && SUB_EXEMPT_API.some(p => pathname.startsWith(p));
    if (!isExemptApi) {
      const hasAccess = await checkAccess(userId);
      if (!hasAccess) {
        if (isApi) return NextResponse.json({ error: 'subscription_required' }, { status: 402 });
        if (pathname !== '/paywall') return NextResponse.redirect(new URL('/paywall', request.url));
      }
    }
  }

  return NextResponse.next();
}

// Next.js requires the middleware export to be named "middleware"
export { proxy as middleware };

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
