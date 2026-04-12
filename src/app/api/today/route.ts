import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

const TIMEZONE = 'Australia/Melbourne';

function getTodayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

export const GET = withAuth(async (_req, userId) => {
  const today = getTodayDate();

  const { data } = await supabaseAdmin
    .from('todos')
    .select('todo, created_at')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  const { data: completionRows } = await supabaseAdmin
    .from('task_completions')
    .select('task_id')
    .eq('user_id', userId)
    .eq('date', today);

  const completed_ids = (completionRows || []).map((c: { task_id: string }) => c.task_id);

  if (data?.todo) {
    return NextResponse.json({ plan: data.todo, date: today, generated_at: data.created_at, completed_ids });
  }

  return NextResponse.json({ plan: null, date: today, completed_ids });
});
