import { NextResponse } from 'next/server';
import { withEdgeAuth, SWR_HEADERS } from '@/lib/edge-auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'edge'; // 10x faster cold start

const TIMEZONE = 'Australia/Melbourne';

function getTodayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

export const GET = withEdgeAuth(async (req, userId) => {
  const url = new URL(req.url);
  const date = url.searchParams.get('date') || getTodayDate();

  const [{ data }, { data: completionRows }] = await Promise.all([
    supabaseAdmin.from('todos').select('todo, created_at').eq('user_id', userId).eq('date', date).single(),
    supabaseAdmin.from('task_completions').select('task_id').eq('user_id', userId).eq('date', date),
  ]);

  const completed_ids = (completionRows || []).map((c: { task_id: string }) => c.task_id);

  const body = data?.todo
    ? { plan: data.todo, date, generated_at: data.created_at, completed_ids }
    : { plan: null, date, completed_ids };

  return NextResponse.json(body, { headers: SWR_HEADERS });
});
