import { supabaseAdmin } from './supabase';
import type { Task, Subtask, TaskList, TaskReminder, CreateTaskInput, TaskFilters } from './task-types';

export async function getTasks(userId: string, filters?: TaskFilters): Promise<Task[]> {
  let q = supabaseAdmin.from('tasks').select('*').eq('user_id', userId);

  if (filters?.status) {
    q = q.eq('status', filters.status);
  } else {
    q = q.neq('status', 'cancelled');
  }
  if (filters?.due_date) q = q.eq('due_date', filters.due_date);
  if (filters?.due_before) q = q.lte('due_date', filters.due_before);
  if (filters?.due_after) q = q.gte('due_date', filters.due_after);
  if (filters?.list_id) q = q.eq('list_id', filters.list_id);
  if (filters?.priority_gte !== undefined) q = q.gte('priority', filters.priority_gte);
  if (filters?.tags_any) q = q.overlaps('tags', filters.tags_any);
  if (filters?.domain) q = q.eq('domain', filters.domain);
  if (filters?.search) q = q.ilike('title', '%' + filters.search + '%');

  const { data, error } = await q.order('sort_order', { ascending: true }).order('created_at', { ascending: false });
  if (error) throw error;
  return data as Task[];
}

export async function getTask(userId: string, taskId: string): Promise<Task | null> {
  const { data, error } = await supabaseAdmin
    .from('tasks')
    .select('*, subtasks(*), task_reminders(*)')
    .eq('user_id', userId)
    .eq('id', taskId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  const task = data as Task & { task_reminders?: TaskReminder[] };
  task.reminders = task.task_reminders;
  delete (task as unknown as Record<string, unknown>).task_reminders;
  return task;
}

export async function createTask(userId: string, input: CreateTaskInput): Promise<Task> {
  const listFilter = input.list_id
    ? supabaseAdmin.from('tasks').select('sort_order').eq('user_id', userId).eq('list_id', input.list_id).order('sort_order', { ascending: false }).limit(1)
    : supabaseAdmin.from('tasks').select('sort_order').eq('user_id', userId).order('sort_order', { ascending: false }).limit(1);

  const { data: maxRow } = await listFilter;
  const sortOrder = maxRow && maxRow.length > 0 ? (maxRow[0] as { sort_order: number }).sort_order + 1 : 0;

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('tasks')
    .insert({
      user_id: userId,
      title: input.title,
      description: input.description ?? '',
      notes: '',
      due_date: input.due_date ?? null,
      due_time: input.due_time ?? null,
      start_date: input.start_date ?? null,
      estimated_minutes: input.estimated_minutes ?? null,
      priority: input.priority ?? 0,
      domain: input.domain ?? 'personal',
      list_id: input.list_id ?? null,
      tags: input.tags ?? [],
      status: 'todo',
      rrule: input.rrule ?? null,
      source: input.source ?? 'manual',
      sort_order: sortOrder,
      kanban_column: 'todo',
      updated_at: now,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Task;
}

export async function updateTask(userId: string, taskId: string, data: Partial<Task>): Promise<Task | null> {
  const updates: Record<string, unknown> = { ...data, updated_at: new Date().toISOString() };
  if (data.status === 'done' && !data.completed_at) {
    updates.completed_at = new Date().toISOString();
  }
  delete updates.id;
  delete updates.user_id;
  delete updates.created_at;
  delete updates.subtasks;
  delete updates.reminders;

  const { data: row, error } = await supabaseAdmin
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return row as Task;
}

export async function deleteTask(userId: string, taskId: string): Promise<boolean> {
  const { error, count } = await supabaseAdmin
    .from('tasks')
    .delete({ count: 'exact' })
    .eq('id', taskId)
    .eq('user_id', userId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function reorderTasks(userId: string, updates: { id: string; sort_order: number }[]): Promise<void> {
  await Promise.all(
    updates.map(({ id, sort_order }) =>
      supabaseAdmin.from('tasks').update({ sort_order, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId)
    )
  );
}

export async function getSubtasks(taskId: string): Promise<Subtask[]> {
  const { data, error } = await supabaseAdmin
    .from('subtasks')
    .select('*')
    .eq('task_id', taskId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data as Subtask[];
}

export async function createSubtask(taskId: string, title: string, sortOrder?: number): Promise<Subtask> {
  let order = sortOrder;
  if (order === undefined) {
    const { data: maxRow } = await supabaseAdmin
      .from('subtasks')
      .select('sort_order')
      .eq('task_id', taskId)
      .order('sort_order', { ascending: false })
      .limit(1);
    order = maxRow && maxRow.length > 0 ? (maxRow[0] as { sort_order: number }).sort_order + 1 : 0;
  }
  const { data, error } = await supabaseAdmin
    .from('subtasks')
    .insert({ task_id: taskId, title, completed: false, sort_order: order })
    .select()
    .single();
  if (error) throw error;
  return data as Subtask;
}

export async function updateSubtask(subtaskId: string, data: { title?: string; completed?: boolean }): Promise<Subtask | null> {
  const { data: row, error } = await supabaseAdmin
    .from('subtasks')
    .update(data)
    .eq('id', subtaskId)
    .select()
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return row as Subtask;
}

export async function deleteSubtask(subtaskId: string): Promise<boolean> {
  const { error, count } = await supabaseAdmin
    .from('subtasks')
    .delete({ count: 'exact' })
    .eq('id', subtaskId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function getTaskLists(userId: string): Promise<TaskList[]> {
  const { data, error } = await supabaseAdmin
    .from('task_lists')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data as TaskList[];
}

export async function createTaskList(userId: string, data: { name: string; color?: string; icon?: string }): Promise<TaskList> {
  const { data: maxRow } = await supabaseAdmin
    .from('task_lists')
    .select('sort_order')
    .eq('user_id', userId)
    .order('sort_order', { ascending: false })
    .limit(1);
  const sortOrder = maxRow && maxRow.length > 0 ? (maxRow[0] as { sort_order: number }).sort_order + 1 : 0;

  const { data: row, error } = await supabaseAdmin
    .from('task_lists')
    .insert({
      user_id: userId,
      name: data.name,
      color: data.color ?? '#6366f1',
      icon: data.icon ?? 'list',
      is_smart: false,
      sort_order: sortOrder,
    })
    .select()
    .single();
  if (error) throw error;
  return row as TaskList;
}

export async function updateTaskList(listId: string, data: Partial<TaskList>): Promise<TaskList | null> {
  const updates = { ...data };
  delete (updates as Record<string, unknown>).id;
  delete (updates as Record<string, unknown>).user_id;
  delete (updates as Record<string, unknown>).created_at;

  const { data: row, error } = await supabaseAdmin
    .from('task_lists')
    .update(updates)
    .eq('id', listId)
    .select()
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return row as TaskList;
}

export async function deleteTaskList(listId: string): Promise<boolean> {
  const { error, count } = await supabaseAdmin
    .from('task_lists')
    .delete({ count: 'exact' })
    .eq('id', listId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function getReminders(taskId: string): Promise<TaskReminder[]> {
  const { data, error } = await supabaseAdmin
    .from('task_reminders')
    .select('*')
    .eq('task_id', taskId)
    .order('remind_at', { ascending: true });
  if (error) throw error;
  return data as TaskReminder[];
}

export async function createReminder(userId: string, taskId: string, data: { remind_at: string; offset_minutes?: number }): Promise<TaskReminder> {
  const { data: row, error } = await supabaseAdmin
    .from('task_reminders')
    .insert({
      user_id: userId,
      task_id: taskId,
      remind_at: data.remind_at,
      offset_minutes: data.offset_minutes ?? null,
      sent: false,
    })
    .select()
    .single();
  if (error) throw error;
  return row as TaskReminder;
}

export async function deleteReminder(reminderId: string): Promise<boolean> {
  const { error, count } = await supabaseAdmin
    .from('task_reminders')
    .delete({ count: 'exact' })
    .eq('id', reminderId);
  if (error) throw error;
  return (count ?? 0) > 0;
}
