import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { fetchConnection } from '@/lib/connections';

export const POST = withAuth(async (req: Request) => {
  const id = req.url.split('/connections/')[1]?.split('/')[0];
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { result, error } = await fetchConnection(id);

  if (error && !result) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ result, error: error || null });
});
