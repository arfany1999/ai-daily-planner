import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { reorderTasks } from '@/lib/tasks';

export const POST = withAuth(async (req, userId) => {
  const { updates } = await req.json();
  if (!Array.isArray(updates)) {
    return NextResponse.json({ error: 'updates array required' }, { status: 400 });
  }
  await reorderTasks(userId, updates);
  return NextResponse.json({ success: true });
});
