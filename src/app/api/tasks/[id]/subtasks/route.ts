import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { getSubtasks, createSubtask, getTask } from '@/lib/tasks';

export const GET = withAuth(async (req, userId) => {
  const taskId = req.url.split('/tasks/')[1]?.split('/')[0];
  if (!taskId) return NextResponse.json({ error: 'Missing task id' }, { status: 400 });
  const task = await getTask(userId, taskId);
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  const subtasks = await getSubtasks(taskId);
  return NextResponse.json({ subtasks });
});

export const POST = withAuth(async (req, userId) => {
  const taskId = req.url.split('/tasks/')[1]?.split('/')[0];
  if (!taskId) return NextResponse.json({ error: 'Missing task id' }, { status: 400 });
  const task = await getTask(userId, taskId);
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  const { title } = await req.json();
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  const subtask = await createSubtask(taskId, title);
  return NextResponse.json({ subtask }, { status: 201 });
});
