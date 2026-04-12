import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

// Remove a task completion (un-check)
export const POST = withAuth(async (req, userId) => {
  const { task_id, date } = await req.json();
  if (!task_id || !date) return NextResponse.json({ error: 'Missing task_id or date' }, { status: 400 });

  await supabaseAdmin
    .from('task_completions')
    .delete()
    .eq('user_id', userId)
    .eq('task_id', task_id)
    .eq('date', date);

  return NextResponse.json({ success: true, task_id, date });
});
