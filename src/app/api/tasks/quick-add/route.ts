import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';
import { createGcalEvent } from '@/lib/google';

const TIMEZONE = 'Australia/Melbourne';

function getTodayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}
function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h || 0) * 60 + (m || 0) + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export const POST = withAuth(async (req, userId) => {
  const { label, urgency, time } = await req.json();
  if (!label || typeof label !== 'string') {
    return NextResponse.json({ error: 'Missing label' }, { status: 400 });
  }

  const today = getTodayDate();

  // Mirror to Google Calendar if we have a time
  let gcalId: string | null = null;
  if (time) {
    gcalId = await createGcalEvent(userId, {
      title: label,
      date: today,
      start_time: time,
      end_time: addMinutes(time, 30),
      description: 'Quick-added via AI Planner',
      domain: urgency === 'class' ? 'academia' : urgency === 'gym' ? 'health' : urgency === 'work' ? 'dev' : 'admin',
    });
  }

  const newTask = {
    id: crypto.randomUUID(),
    task_name: label,
    start_time: time || '',
    end_time: time ? addMinutes(time, 30) : '',
    urgency: urgency || 'amber',
    description: '',
    estimated_minutes: 30,
    google_event_id: gcalId || undefined,
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
