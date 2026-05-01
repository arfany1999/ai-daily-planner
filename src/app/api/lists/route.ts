import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { getTaskLists, createTaskList } from '@/lib/tasks';

export const GET = withAuth(async (_req, userId) => {
  const lists = await getTaskLists(userId);
  return NextResponse.json({ lists });
});

export const POST = withAuth(async (req, userId) => {
  const body = await req.json();
  if (!body.name || typeof body.name !== 'string') {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }
  const list = await createTaskList(userId, body);
  return NextResponse.json({ list }, { status: 201 });
});
