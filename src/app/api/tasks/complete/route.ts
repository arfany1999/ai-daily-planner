import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

export const POST = withAuth(async (req, userId) => {
  const { task_id, date } = await req.json();
  if (!task_id || !date) return NextResponse.json({ error: 'Missing task_id or date' }, { status: 400 });

  // Upsert to handle race conditions (idempotent)
  await supabaseAdmin.from('task_completions').upsert({
    user_id: userId,
    task_id,
    date,
    action: 'completed',
  }, { onConflict: 'user_id,task_id,date', ignoreDuplicates: true });

  const { count } = await supabaseAdmin
    .from('task_completions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('date', date);

  return NextResponse.json({ success: true, task_id, date, total_completed: count });
});
