import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { getTask, getReminders, createReminder } from '@/lib/tasks';

export const GET = withAuth(async (req, userId) => {
  const taskId = req.url.split('/tasks/')[1]?.split('/')[0];
  if (!taskId) return NextResponse.json({ error: 'Missing task id' }, { status: 400 });
  const task = await getTask(userId, taskId);
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  const reminders = await getReminders(taskId);
  return NextResponse.json({ reminders });
});

export const POST = withAuth(async (req, userId) => {
  const taskId = req.url.split('/tasks/')[1]?.split('/')[0];
  if (!taskId) return NextResponse.json({ error: 'Missing task id' }, { status: 400 });
  const task = await getTask(userId, taskId);
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  const body = await req.json();
  if (!body.remind_at) return NextResponse.json({ error: 'remind_at required' }, { status: 400 });
  const reminder = await createReminder(userId, taskId, body);
  return NextResponse.json({ reminder }, { status: 201 });
});
