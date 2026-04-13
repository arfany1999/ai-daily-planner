import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

const TIMEZONE = 'Australia/Melbourne';
const NON_TASK = ['class', 'gym', 'work', 'break'];

export const GET = withAuth(async (_req, userId) => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });

  const { data } = await supabaseAdmin
    .from('todos')
    .select('todo')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  if (!data?.todo) return NextResponse.json({ tasks: [] });

  const timeline = (data.todo as { timeline?: { id: string; task_name: string; urgency: string; start_time: string }[] }).timeline || [];
  const tasks = timeline
    .filter(t => !NON_TASK.includes(t.urgency))
    .map(t => ({ id: t.id, task_name: t.task_name, urgency: t.urgency, start_time: t.start_time }));

  // Get completions
  const { data: completions } = await supabaseAdmin
    .from('task_completions')
    .select('task_id')
    .eq('user_id', userId)
    .eq('date', today)
    .eq('action', 'completed');

  const doneIds = new Set((completions || []).map(c => c.task_id));

  return NextResponse.json({
    tasks: tasks.map(t => ({ ...t, completed: doneIds.has(t.id) })),
  });
});
