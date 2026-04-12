import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

const TIMEZONE = 'Australia/Melbourne';
const NON_TASKS = ['class', 'gym', 'work', 'break'];

function toDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=Sun, 1=Mon ...
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-AU', { weekday: 'short' });
}

function weekLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
}

export const GET = withAuth(async (req, userId) => {
  const { searchParams } = new URL(req.url);
  const weekStartParam = searchParams.get('week_start');

  const now = new Date();
  const todayStr = toDateStr(now);

  let weekStart: string;
  if (weekStartParam) {
    weekStart = weekStartParam;
  } else {
    weekStart = getMondayOf(todayStr);
  }

  const weekEnd = addDays(weekStart, 6);

  // ── Cached AI reflection ──────────────────────────────────────────────────
  const { data: cachedWeekly } = await supabaseAdmin
    .from('progress_weekly')
    .select('data')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .single();

  // ── Week totals ───────────────────────────────────────────────────────────
  const { count: completionCount } = await supabaseAdmin
    .from('task_completions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('date', weekStart)
    .lte('date', weekEnd)
    .not('task_id', 'like', 'pushed_%');

  const { data: todoRows } = await supabaseAdmin
    .from('todos')
    .select('todo')
    .eq('user_id', userId)
    .gte('date', weekStart)
    .lte('date', weekEnd);

  let totalPlanned = 0, totalStudyMinutes = 0;
  for (const row of todoRows || []) {
    try {
      const tasks = ((row.todo as { timeline?: { urgency: string; estimated_minutes?: number }[] })?.timeline || [])
        .filter((t) => !NON_TASKS.includes(t.urgency));
      totalPlanned += tasks.length;
      totalStudyMinutes += tasks.reduce((s, t) => s + (t.estimated_minutes || 0), 0);
    } catch { /* skip */ }
  }

  // ── Streak (check today first, then go backwards) ─────────────────────────
  let streak = 0;
  const streakCheck = new Date(now);
  for (let i = 0; i < 30; i++) {
    const dateStr = toDateStr(streakCheck);

    const { data: dayTodo } = await supabaseAdmin
      .from('todos')
      .select('todo')
      .eq('user_id', userId)
      .eq('date', dateStr)
      .single();

    if (!dayTodo) {
      if (i === 0) {
        // No todo today — don't break, just skip today and keep checking back
        streakCheck.setDate(streakCheck.getDate() - 1);
        continue;
      }
      break;
    }

    const dayTimeline = ((dayTodo.todo as { timeline?: { id: string; urgency: string }[] })?.timeline || []);
    const dayTasks = dayTimeline.filter((t) => !NON_TASKS.includes(t.urgency));

    if (dayTasks.length === 0) {
      // No actionable tasks — skip this day
      streakCheck.setDate(streakCheck.getDate() - 1);
      continue;
    }

    const { data: dayCompletions } = await supabaseAdmin
      .from('task_completions')
      .select('task_id')
      .eq('user_id', userId)
      .eq('date', dateStr)
      .not('task_id', 'like', 'pushed_%');

    const completedIds = new Set((dayCompletions || []).map((c) => c.task_id));
    if (dayTasks.every((t) => completedIds.has(t.id))) {
      streak++;
      streakCheck.setDate(streakCheck.getDate() - 1);
    } else {
      // Today may be incomplete mid-day — don't count but don't break streak for today
      if (i === 0) {
        streakCheck.setDate(streakCheck.getDate() - 1);
        continue;
      }
      break;
    }
  }

  // ── Daily array (Mon–Sun of current week) ─────────────────────────────────
  const dailyDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const { data: weekCompletionRows } = await supabaseAdmin
    .from('task_completions')
    .select('task_id, date')
    .eq('user_id', userId)
    .gte('date', weekStart)
    .lte('date', weekEnd)
    .not('task_id', 'like', 'pushed_%');

  const { data: weekTodoRows } = await supabaseAdmin
    .from('todos')
    .select('todo, date')
    .eq('user_id', userId)
    .gte('date', weekStart)
    .lte('date', weekEnd);

  // Build maps keyed by date
  const todoByDate = new Map<string, { id: string; urgency: string }[]>();
  for (const row of weekTodoRows || []) {
    const dateKey = (row as { date: string }).date;
    const timeline = ((row.todo as { timeline?: { id: string; urgency: string }[] })?.timeline || [])
      .filter((t) => !NON_TASKS.includes(t.urgency));
    todoByDate.set(dateKey, timeline);
  }

  const completionsByDate = new Map<string, Set<string>>();
  for (const c of weekCompletionRows || []) {
    const dateKey = (c as { date: string }).date;
    if (!completionsByDate.has(dateKey)) completionsByDate.set(dateKey, new Set());
    completionsByDate.get(dateKey)!.add((c as { task_id: string }).task_id);
  }

  const daily = dailyDates.map((date) => {
    const tasks = todoByDate.get(date) || [];
    const done = completionsByDate.get(date);
    const completed = tasks.filter((t) => done?.has(t.id)).length;
    const planned = tasks.length;
    const pct = planned > 0 ? Math.round((completed / planned) * 100) : 0;
    return { date, day: dayLabel(date), completed, planned, pct };
  });

  // ── Weekly trend (4 prior full weeks + current week) ──────────────────────
  const trendWeeks: string[] = [];
  for (let w = 4; w >= 0; w--) {
    const ws = addDays(weekStart, -7 * w);
    trendWeeks.push(ws);
  }

  const trendStart = trendWeeks[0];
  const trendEnd = addDays(trendWeeks[trendWeeks.length - 1], 6);

  const { data: trendTodoRows } = await supabaseAdmin
    .from('todos')
    .select('todo, date')
    .eq('user_id', userId)
    .gte('date', trendStart)
    .lte('date', trendEnd);

  const { data: trendCompletionRows } = await supabaseAdmin
    .from('task_completions')
    .select('task_id, date')
    .eq('user_id', userId)
    .gte('date', trendStart)
    .lte('date', trendEnd)
    .not('task_id', 'like', 'pushed_%');

  const trendTodoByDate = new Map<string, number>();
  for (const row of trendTodoRows || []) {
    const dateKey = (row as { date: string }).date;
    const count = ((row.todo as { timeline?: { urgency: string }[] })?.timeline || [])
      .filter((t) => !NON_TASKS.includes(t.urgency)).length;
    trendTodoByDate.set(dateKey, count);
  }

  const trendCompByDate = new Map<string, number>();
  for (const c of trendCompletionRows || []) {
    const dateKey = (c as { date: string }).date;
    trendCompByDate.set(dateKey, (trendCompByDate.get(dateKey) || 0) + 1);
  }

  const weekly_trend = trendWeeks.map((ws) => {
    let planned = 0, completed = 0;
    for (let d = 0; d < 7; d++) {
      const dt = addDays(ws, d);
      planned += trendTodoByDate.get(dt) || 0;
      completed += trendCompByDate.get(dt) || 0;
    }
    const pct = planned > 0 ? Math.round((completed / planned) * 100) : 0;
    return { week_start: ws, label: weekLabel(ws), pct, completed, planned };
  });

  // ── Today's tasks ─────────────────────────────────────────────────────────
  const { data: todayTodoRow } = await supabaseAdmin
    .from('todos')
    .select('todo')
    .eq('user_id', userId)
    .eq('date', todayStr)
    .single();

  const { data: todayCompletionRows } = await supabaseAdmin
    .from('task_completions')
    .select('task_id')
    .eq('user_id', userId)
    .eq('date', todayStr)
    .not('task_id', 'like', 'pushed_%');

  const todayCompletedIds = new Set((todayCompletionRows || []).map((c) => (c as { task_id: string }).task_id));

  type TimelineTask = { id: string; time?: string; label?: string; urgency: string };
  const todayTimeline = ((todayTodoRow?.todo as { timeline?: TimelineTask[] })?.timeline || []);
  const today_tasks = todayTimeline
    .filter((t) => !NON_TASKS.includes(t.urgency))
    .map((t) => ({
      id: t.id,
      label: t.label || '',
      time: t.time || '',
      urgency: t.urgency,
      completed: todayCompletedIds.has(t.id),
    }));

  return NextResponse.json({
    tasks_completed: completionCount || 0,
    tasks_planned: totalPlanned,
    completion_rate: totalPlanned > 0 ? Math.round(((completionCount || 0) / totalPlanned) * 100) : 0,
    study_hours: Math.round((totalStudyMinutes / 60) * 10) / 10,
    streak,
    week_start: weekStart,
    week_end: weekEnd,
    ai_reflection: cachedWeekly ? (cachedWeekly.data as { ai_reflection?: string })?.ai_reflection ?? null : null,
    daily,
    weekly_trend,
    today_tasks,
  });
});
