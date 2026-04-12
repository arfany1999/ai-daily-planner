import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

const TIMEZONE = 'Australia/Melbourne';

export const GET = withAuth(async (req, userId) => {
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.toLowerCase() || '';
  if (!q) return NextResponse.json({ results: [] });

  const today = new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const fromDate = thirtyDaysAgo.toLocaleDateString('en-CA', { timeZone: TIMEZONE });

  const { data: rows } = await supabaseAdmin
    .from('todos')
    .select('date, todo')
    .eq('user_id', userId)
    .gte('date', fromDate)
    .lte('date', today)
    .order('date', { ascending: false })
    .limit(30);

  type TItem = { id: string; task_name: string; urgency: string; start_time?: string };
  const results: { id: string; task_name: string; urgency: string; start_time: string; date: string }[] = [];

  for (const row of rows || []) {
    const timeline: TItem[] = (row.todo as { timeline?: TItem[] })?.timeline || [];
    for (const task of timeline) {
      if (task.task_name?.toLowerCase().includes(q)) {
        results.push({ id: task.id, task_name: task.task_name, urgency: task.urgency, start_time: task.start_time || '', date: row.date });
      }
    }
  }

  return NextResponse.json({ results: results.slice(0, 20) });
});
