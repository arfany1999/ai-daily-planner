import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

const TIMEZONE = 'Australia/Melbourne';

export const GET = withAuth(async (req, userId) => {
  const { searchParams } = new URL(req.url);
  const weekStartParam = searchParams.get('week_start');

  let weekStart: string;
  if (weekStartParam) { weekStart = weekStartParam; }
  else { const now = new Date(); const day = now.getDay(); const diff = day === 0 ? 6 : day - 1; const monday = new Date(now); monday.setDate(now.getDate() - diff); weekStart = monday.toLocaleDateString('en-CA', { timeZone: TIMEZONE }); }

  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = weekEnd.toLocaleDateString('en-CA', { timeZone: TIMEZONE });

  // Cached weekly progress
  const { data: cachedWeekly } = await supabaseAdmin
    .from('progress_weekly')
    .select('data')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .single();

  // Count completions (excluding pushes)
  const { count: completionCount } = await supabaseAdmin
    .from('task_completions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('date', weekStart)
    .lte('date', weekEndStr)
    .not('task_id', 'like', 'pushed_%');

  // Get todo rows for the week
  const { data: todoRows } = await supabaseAdmin
    .from('todos')
    .select('todo')
    .eq('user_id', userId)
    .gte('date', weekStart)
    .lte('date', weekEndStr);

  let totalPlanned = 0, totalStudyMinutes = 0;
  for (const row of todoRows || []) {
    try {
      const todo = row.todo as { timeline?: { urgency: string; estimated_minutes?: number }[] };
      const tasks = (todo.timeline || []).filter((t) => !['class', 'gym', 'work', 'break'].includes(t.urgency));
      totalPlanned += tasks.length;
      totalStudyMinutes += tasks.reduce((s, t) => s + (t.estimated_minutes || 0), 0);
    } catch { /* skip */ }
  }

  // Calculate streak
  let streak = 0;
  const checkDate = new Date();
  checkDate.setDate(checkDate.getDate() - 1);
  for (let i = 0; i < 30; i++) {
    const dateStr = checkDate.toLocaleDateString('en-CA', { timeZone: TIMEZONE });

    const { data: dayTodo } = await supabaseAdmin
      .from('todos')
      .select('todo')
      .eq('user_id', userId)
      .eq('date', dateStr)
      .single();
    if (!dayTodo) break;

    const dayTimeline = (dayTodo.todo as { timeline?: { id: string; urgency: string }[] })?.timeline || [];
    const dayTasks = dayTimeline.filter((t) => !['class', 'gym', 'work', 'break'].includes(t.urgency));
    if (dayTasks.length === 0) { checkDate.setDate(checkDate.getDate() - 1); continue; }

    const { data: dayCompletions } = await supabaseAdmin
      .from('task_completions')
      .select('task_id')
      .eq('user_id', userId)
      .eq('date', dateStr)
      .not('task_id', 'like', 'pushed_%');

    const completedIds = new Set((dayCompletions || []).map((c) => c.task_id));
    if (dayTasks.every((t) => completedIds.has(t.id))) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else break;
  }

  return NextResponse.json({
    tasks_completed: completionCount || 0,
    tasks_planned: totalPlanned,
    completion_rate: totalPlanned > 0 ? Math.round(((completionCount || 0) / totalPlanned) * 100) : 0,
    study_hours: Math.round(totalStudyMinutes / 60 * 10) / 10,
    assignments_progressed: Math.min(completionCount || 0, 10),
    streak,
    week_start: weekStart,
    week_end: weekEndStr,
    ai_reflection: cachedWeekly ? (cachedWeekly.data as { ai_reflection?: string })?.ai_reflection : null,
  });
});
