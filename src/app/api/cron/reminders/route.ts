import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendPushToUser } from '@/lib/push';

const CRON_SECRET = process.env.CRON_SECRET;

function verifyCron(req: Request): boolean {
  if (!CRON_SECRET) return true;
  return req.headers.get('authorization') === `Bearer ${CRON_SECRET}`;
}

export async function GET(req: Request) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: reminders, error } = await supabaseAdmin
    .from('task_reminders')
    .select('id, task_id, user_id')
    .eq('sent', false)
    .lte('remind_at', new Date().toISOString());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!reminders || reminders.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, failed: 0, total: 0 });
  }

  let sent = 0;
  let failed = 0;
  const errors: { reminder_id: string; error: string }[] = [];

  for (const reminder of reminders) {
    try {
      const { data: task } = await supabaseAdmin
        .from('tasks')
        .select('title')
        .eq('id', reminder.task_id)
        .single();

      const title = task?.title || 'Upcoming task';

      await sendPushToUser(reminder.user_id, {
        title: 'Task Reminder',
        body: title,
        tag: 'reminder-' + reminder.id,
        url: '/tasks',
      });

      await supabaseAdmin
        .from('task_reminders')
        .update({ sent: true })
        .eq('id', reminder.id);

      sent++;
    } catch (err) {
      failed++;
      errors.push({
        reminder_id: reminder.id,
        error: err instanceof Error ? err.message : 'unknown',
      });

      await supabaseAdmin
        .from('task_reminders')
        .update({ sent: true })
        .eq('id', reminder.id);
    }
  }

  return NextResponse.json({
    ok: true,
    ran_at: new Date().toISOString(),
    total: reminders.length,
    sent,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  });
}
