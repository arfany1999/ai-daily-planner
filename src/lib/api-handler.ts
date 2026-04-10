import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/options';
import { getUserId, logError } from './db';

type HandlerFn = (req: Request, userId: string, email: string) => Promise<NextResponse>;

export function withAuth(handler: HandlerFn): (req: Request) => Promise<NextResponse> {
  return async (req: Request) => {
    try {
      const session = await getServerSession(authOptions);
      const email = session?.user?.email;
      if (!email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const userId = await getUserId(email);
      if (!userId) {
        return NextResponse.json({ error: 'User not found. Please sign in again.' }, { status: 401 });
      }

      return await handler(req, userId, email);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const url = new URL(req.url);
      await logError(url.pathname, message).catch(() => {});
      console.error(`API Error [${url.pathname}]:`, message);
      return NextResponse.json({ error: 'Internal server error', message }, { status: 500 });
    }
  };
}
