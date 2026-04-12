import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { getUserSubscription } from '@/lib/subscription';

export const GET = withAuth(async (_req, userId) => {
  const sub = await getUserSubscription(userId);
  return NextResponse.json(sub);
});
