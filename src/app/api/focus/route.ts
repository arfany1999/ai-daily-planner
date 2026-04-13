import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

const TIMEZONE = 'Australia/Melbourne';
function getTodayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

// GET /api/focus?date=YYYY-MM-DD — list sessions for a date
export const GET = withAuth(async (req, userId) => {
  const url = new URL(req.url);
  const date = url.searchParams.get('date') || getTodayDate();

  const { data, error } = await supabaseAdmin
    .from('focus_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .order('started_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sessions = data || [];
  const total_minutes = sessions.reduce((s, r) => s + (r.actual_minutes || 0), 0);
  const completed_sessions = sessions.filter(r => r.completed).length;

  return NextResponse.json({ sessions, total_minutes, total_sessions: sessions.length, completed_sessions });
});

// POST /api/focus — create a new focus session
export const POST = withAuth(async (req, userId) => {
  const body = await req.json();
  const { task_id, task_name, duration_minutes, interval_preset } = body;

  if (!task_name || !duration_minutes) {
    return NextResponse.json({ error: 'task_name and duration_minutes required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('focus_sessions')
    .insert({
      user_id: userId,
      task_id: task_id || null,
      task_name,
      duration_minutes,
      interval_preset: interval_preset || '25/5',
      date: getTodayDate(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
});
