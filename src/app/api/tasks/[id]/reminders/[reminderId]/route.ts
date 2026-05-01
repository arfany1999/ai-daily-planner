import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { deleteReminder, getTask } from '@/lib/tasks';

export const DELETE = withAuth(async (req, userId) => {
  const taskId = req.url.split('/tasks/')[1]?.split('/')[0];
  const reminderId = req.url.split('/reminders/')[1]?.split('/')[0]?.split('?')[0];
  if (!taskId || !reminderId) return NextResponse.json({ error: 'Missing ids' }, { status: 400 });
  const task = await getTask(userId, taskId);
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  const deleted = await deleteReminder(reminderId);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
});
