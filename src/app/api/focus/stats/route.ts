import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

const TIMEZONE = 'Australia/Melbourne';

export const GET = withAuth(async (req, userId) => {
  const url = new URL(req.url);
  const weekStart = url.searchParams.get('week_start') || new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });

  // Get all sessions for the week (7 days from week_start)
  const endDate = new Date(weekStart);
  endDate.setDate(endDate.getDate() + 7);
  const weekEnd = endDate.toISOString().slice(0, 10);

  const { data: sessions } = await supabaseAdmin
    .from('focus_sessions')
    .select('date, duration_minutes, actual_minutes, completed, interval_preset')
    .eq('user_id', userId)
    .gte('date', weekStart)
    .lt('date', weekEnd);

  const rows = sessions || [];
  const total_focus_minutes = rows.reduce((s, r) => s + (r.actual_minutes || 0), 0);
  const total_sessions = rows.length;
  const completed_sessions = rows.filter(r => r.completed).length;

  // Daily breakdown
  const dailyMap: Record<string, { minutes: number; sessions: number }> = {};
  for (const r of rows) {
    if (!dailyMap[r.date]) dailyMap[r.date] = { minutes: 0, sessions: 0 };
    dailyMap[r.date].minutes += r.actual_minutes || 0;
    dailyMap[r.date].sessions += 1;
  }
  const daily_focus = Object.entries(dailyMap).map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date));

  // Focus streak — consecutive days with at least one completed session (backwards from today)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
  let streak = 0;
  const checkDate = new Date(today);
  for (let i = 0; i < 365; i++) {
    const d = checkDate.toISOString().slice(0, 10);
    const { data: dayData } = await supabaseAdmin
      .from('focus_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('date', d)
      .eq('completed', true)
      .limit(1);
    if (dayData && dayData.length > 0) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      // Allow today to be missing (day not over yet) if i === 0
      if (i === 0) {
        checkDate.setDate(checkDate.getDate() - 1);
        continue;
      }
      break;
    }
  }

  return NextResponse.json({ total_focus_minutes, total_sessions, completed_sessions, daily_focus, streak });
});
