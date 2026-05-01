import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { getTasks, createTask } from '@/lib/tasks';
import type { TaskFilters } from '@/lib/task-types';

export const GET = withAuth(async (req, userId) => {
  const url = new URL(req.url);
  const filters: TaskFilters = {};
  if (url.searchParams.get('status')) filters.status = url.searchParams.get('status')!;
  if (url.searchParams.get('due_date')) filters.due_date = url.searchParams.get('due_date')!;
  if (url.searchParams.get('due_before')) filters.due_before = url.searchParams.get('due_before')!;
  if (url.searchParams.get('due_after')) filters.due_after = url.searchParams.get('due_after')!;
  if (url.searchParams.get('list_id')) filters.list_id = url.searchParams.get('list_id')!;
  if (url.searchParams.get('priority_gte')) filters.priority_gte = Number(url.searchParams.get('priority_gte'));
  if (url.searchParams.get('domain')) filters.domain = url.searchParams.get('domain')!;
  if (url.searchParams.get('search')) filters.search = url.searchParams.get('search')!;
  if (url.searchParams.get('tags')) filters.tags_any = url.searchParams.get('tags')!.split(',');

  const tasks = await getTasks(userId, filters);
  return NextResponse.json({ tasks });
});

export const POST = withAuth(async (req, userId) => {
  const body = await req.json();
  if (!body.title || typeof body.title !== 'string') {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  const task = await createTask(userId, body);
  return NextResponse.json({ task }, { status: 201 });
});
