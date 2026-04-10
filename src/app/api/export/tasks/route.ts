import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

export const GET = withAuth(async (_req, userId) => {
  const { data: rows } = await supabaseAdmin
    .from('task_completions')
    .select('task_id, date, action, created_at')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  // Build CSV
  const lines = ['task_id,date,action,completed_at'];
  for (const row of rows || []) {
    lines.push(`"${row.task_id}","${row.date}","${row.action}","${row.created_at}"`);
  }
  const csv = lines.join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="task-history.csv"',
    },
  });
});
