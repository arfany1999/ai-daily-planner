import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Public routes that don't require authentication
const PUBLIC_PATHS = [
  '/api/auth',
  '/login',
  '/privacy',
  '/terms',
  '/unsubscribe',
  '/_next',
  '/sw.js',
  '/manifest.json',
  '/icons',
];

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

  // Redirect unauthenticated users to landing page
  if (!token) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
