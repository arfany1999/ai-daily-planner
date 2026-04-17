/**
 * Edge-compatible auth helper.
 *
 * NextAuth's getServerSession drags in Node-only deps (bcryptjs via the
 * Credentials provider). For read-only routes that only need the userId,
 * use getToken which reads the JWT cookie and is Edge-safe.
 */

import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

type EdgeHandler = (req: NextRequest, userId: string, email: string) => Promise<Response>;

export function withEdgeAuth(handler: EdgeHandler) {
  return async (req: NextRequest) => {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });
    const userId = (token as unknown as Record<string, string> | null)?.userId;
    const email = (token as unknown as Record<string, string> | null)?.email;
    if (!token || !userId || !email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
      return await handler(req, userId, email);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      return NextResponse.json({ error: 'Internal server error', message: msg }, { status: 500 });
    }
  };
}

/**
 * Standard cache header for user-specific read endpoints.
 * Browser + Vercel CDN serve for `max-age` seconds; `stale-while-revalidate`
 * allows serving stale while a fresh fetch happens in the background.
 */
export const SWR_HEADERS = {
  'Cache-Control': 'private, max-age=15, stale-while-revalidate=120',
};
