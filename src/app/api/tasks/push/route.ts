import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

export const POST = withAuth(async (req, userId) => {
  const { task_id } = await req.json();
  if (!task_id) return NextResponse.json({ error: 'Missing task_id' }, { status: 400 });

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });

  // Upsert to avoid duplicates
  await supabaseAdmin.from('task_completions').upsert({
    user_id: userId,
    task_id: `pushed_${task_id}`,
    date: today,
    action: 'pushed',
  }, { onConflict: 'user_id,task_id,date' });

  return NextResponse.json({ success: true, task_id, pushed_to: 'next day' });
});
