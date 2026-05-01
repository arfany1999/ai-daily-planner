import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { updateSubtask, deleteSubtask, getTask } from '@/lib/tasks';

export const PATCH = withAuth(async (req, userId) => {
  const parts = req.url.split('/subtasks/');
  const taskId = req.url.split('/tasks/')[1]?.split('/')[0];
  const subtaskId = parts[1]?.split('/')[0]?.split('?')[0];
  if (!taskId || !subtaskId) return NextResponse.json({ error: 'Missing ids' }, { status: 400 });
  const task = await getTask(userId, taskId);
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  const body = await req.json();
  const subtask = await updateSubtask(subtaskId, body);
  if (!subtask) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ subtask });
});

export const DELETE = withAuth(async (req, userId) => {
  const parts = req.url.split('/subtasks/');
  const taskId = req.url.split('/tasks/')[1]?.split('/')[0];
  const subtaskId = parts[1]?.split('/')[0]?.split('?')[0];
  if (!taskId || !subtaskId) return NextResponse.json({ error: 'Missing ids' }, { status: 400 });
  const task = await getTask(userId, taskId);
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  const deleted = await deleteSubtask(subtaskId);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
});
