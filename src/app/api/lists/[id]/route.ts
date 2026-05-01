import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { updateTaskList, deleteTaskList } from '@/lib/tasks';

export const PATCH = withAuth(async (req) => {
  const id = req.url.split('/lists/')[1]?.split('/')[0]?.split('?')[0];
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const body = await req.json();
  const list = await updateTaskList(id, body);
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ list });
});

export const DELETE = withAuth(async (req) => {
  const id = req.url.split('/lists/')[1]?.split('/')[0]?.split('?')[0];
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const deleted = await deleteTaskList(id);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
});
