import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { getTask, updateTask, deleteTask } from '@/lib/tasks';

export const GET = withAuth(async (req, userId) => {
  const id = req.url.split('/tasks/')[1]?.split('/')[0]?.split('?')[0];
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const task = await getTask(userId, id);
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ task });
});

export const PATCH = withAuth(async (req, userId) => {
  const id = req.url.split('/tasks/')[1]?.split('/')[0]?.split('?')[0];
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const body = await req.json();
  const task = await updateTask(userId, id, body);
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ task });
});

export const DELETE = withAuth(async (req, userId) => {
  const id = req.url.split('/tasks/')[1]?.split('/')[0]?.split('?')[0];
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const deleted = await deleteTask(userId, id);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
});
