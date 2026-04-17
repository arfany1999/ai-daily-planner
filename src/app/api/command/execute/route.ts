import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

const TZ = 'Australia/Melbourne';

interface Cmd {
  intent: string;
  title?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  duration_min?: number;
  domain?: string;
  query?: string;
  route?: string;
  raw?: string;
}

function urgencyFromDomain(d?: string): string {
  if (d === 'academia') return 'class';
  if (d === 'health') return 'gym';
  if (d === 'dev') return 'work';
  if (d === 'break') return 'break';
  return 'amber';
}

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

export const POST = withAuth(async (req, userId) => {
  const cmd = await req.json() as Cmd;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const targetDate = cmd.date || today;

  if (cmd.intent === 'schedule') {
    const start = cmd.start_time || '';
    const end = cmd.end_time || (start && cmd.duration_min ? addMinutes(start, cmd.duration_min) : '');
    const task = {
      id: crypto.randomUUID(),
      task_name: cmd.title || cmd.raw || 'Untitled',
      start_time: start,
      end_time: end,
      urgency: urgencyFromDomain(cmd.domain),
      domain: cmd.domain || 'admin',
      description: '',
      estimated_minutes: cmd.duration_min || 30,
    };
    const { data: existing } = await supabaseAdmin
      .from('todos').select('todo').eq('user_id', userId).eq('date', targetDate).single();
    let plan: { timeline?: typeof task[] } & Record<string, unknown>;
    if (existing?.todo) {
      plan = existing.todo as typeof plan;
      const timeline = Array.isArray(plan.timeline) ? [...plan.timeline, task] : [task];
      plan = { ...plan, timeline };
    } else {
      plan = { timeline: [task] };
    }
    await supabaseAdmin.from('todos').upsert(
      { user_id: userId, date: targetDate, todo: plan },
      { onConflict: 'user_id,date' }
    );
    return NextResponse.json({ success: true, task });
  }

  if (cmd.intent === 'complete' && cmd.title) {
    // Soft complete by title match on today's plan
    await supabaseAdmin.from('task_completions').upsert(
      { user_id: userId, task_id: cmd.title, date: today },
      { onConflict: 'user_id,task_id,date' }
    );
    return NextResponse.json({ success: true });
  }

  if (cmd.intent === 'delete' && cmd.title) {
    const { data: existing } = await supabaseAdmin
      .from('todos').select('todo').eq('user_id', userId).eq('date', targetDate).single();
    if (existing?.todo) {
      const plan = existing.todo as { timeline?: { id: string; task_name: string }[] };
      plan.timeline = (plan.timeline || []).filter(t =>
        !t.task_name.toLowerCase().includes((cmd.title || '').toLowerCase())
      );
      await supabaseAdmin.from('todos').update({ todo: plan }).eq('user_id', userId).eq('date', targetDate);
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, error: `Unsupported intent: ${cmd.intent}` }, { status: 400 });
});
