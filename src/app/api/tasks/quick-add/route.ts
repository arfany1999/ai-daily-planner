import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

const TIMEZONE = 'Australia/Melbourne';

function getTodayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

export const POST = withAuth(async (req, userId) => {
  const { label, urgency, time } = await req.json();
  if (!label || typeof label !== 'string') {
    return NextResponse.json({ error: 'Missing label' }, { status: 400 });
  }

  const today = getTodayDate();

  const newTask = {
    id: crypto.randomUUID(),
    task_name: label,
    start_time: time || '',
    end_time: '',
    urgency: urgency || 'amber',
    description: '',
    estimated_minutes: 30,
  };

  const { data: existing } = await supabaseAdmin
    .from('todos')
    .select('todo')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  let plan: { timeline?: typeof newTask[] } & Record<string, unknown>;

  if (existing?.todo) {
    plan = existing.todo as typeof plan;
    const timeline = Array.isArray((plan as { timeline?: typeof newTask[] }).timeline)
      ? [...(plan as { timeline: typeof newTask[] }).timeline, newTask]
      : [newTask];
    plan = { ...plan, timeline };
  } else {
    plan = { timeline: [newTask] };
  }

  await supabaseAdmin
    .from('todos')
    .upsert({ user_id: userId, date: today, todo: plan }, { onConflict: 'user_id,date' });

  return NextResponse.json({ task: newTask, plan });
});
