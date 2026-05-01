import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getNextOccurrence } from '@/lib/rrule';

const CRON_SECRET = process.env.CRON_SECRET;

function verifyCron(req: Request): boolean {
  if (!CRON_SECRET) return true;
  return req.headers.get('authorization') === `Bearer ${CRON_SECRET}`;
}

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = getTodayDate();

  const { data: parents, error: fetchErr } = await supabaseAdmin
    .from('tasks')
    .select('*')
    .not('rrule', 'is', null)
    .neq('status', 'cancelled')
    .is('rrule_parent_id', null);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  let generated = 0;
  const errors: string[] = [];

  for (const parent of parents ?? []) {
    try {
      const { data: existing } = await supabaseAdmin
        .from('tasks')
        .select('id')
        .eq('rrule_parent_id', parent.id)
        .gte('due_date', today)
        .limit(1);

      if (existing && existing.length > 0) continue;

      const nextDate = getNextOccurrence(parent.rrule, parent.due_date ?? today);
      if (!nextDate) continue;

      const { error: insertErr } = await supabaseAdmin.from('tasks').insert({
        user_id: parent.user_id,
        title: parent.title,
        description: parent.description,
        priority: parent.priority,
        domain: parent.domain,
        list_id: parent.list_id,
        tags: parent.tags,
        estimated_minutes: parent.estimated_minutes,
        rrule_parent_id: parent.id,
        source: 'recurring',
        status: 'todo',
        due_date: nextDate,
        due_time: parent.due_time,
      });

      if (insertErr) {
        errors.push(`${parent.id}: ${insertErr.message}`);
      } else {
        generated++;
      }
    } catch (e) {
      errors.push(`${parent.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    date: today,
    parents_checked: parents?.length ?? 0,
    tasks_generated: generated,
    errors: errors.length > 0 ? errors : undefined,
  });
}
