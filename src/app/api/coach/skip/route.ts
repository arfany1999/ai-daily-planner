import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

const TZ = 'Australia/Melbourne';

type Action = 'skip' | 'reschedule' | 'drop' | 'done';

interface Body {
  task_id: string;
  date?: string;
  action: Action;
  slot?: string; // which energy slot the task fell in ('morning' | 'midday' | 'afternoon' | 'evening')
  domain?: string;
}

/**
 * Study-coach feedback endpoint. Records user's response to a "you skipped X" prompt
 * and updates energy-curve weights so future scheduling reflects actual behavior.
 *
 * Logic:
 *   - skip → mild negative signal on that slot (decrement weight by 1, min 1)
 *   - drop → stronger negative (decrement 2, min 1) + mark task removed
 *   - reschedule → neutral (slot isn't the issue; just timing)
 *   - done → positive (increment weight by 1, max 5)
 */
export const POST = withAuth(async (req, userId) => {
  const { task_id, date, action, slot, domain } = await req.json() as Body;
  const day = date || new Date().toLocaleDateString('en-CA', { timeZone: TZ });

  try {
    await supabaseAdmin.from('skip_log').insert({
      user_id: userId,
      task_id,
      date: day,
      action,
      slot: slot || null,
      domain: domain || null,
      created_at: new Date().toISOString(),
    });
  } catch {}

  if (slot && (action === 'skip' || action === 'drop' || action === 'done')) {
    const { data: settings } = await supabaseAdmin
      .from('user_settings').select('energy_curve').eq('user_id', userId).single();
    const curve = ((settings?.energy_curve as Record<string, number> | undefined) || {}) as Record<string, number>;
    const current = curve[slot] ?? 3;
    let next = current;
    if (action === 'skip') next = Math.max(1, current - 1);
    else if (action === 'drop') next = Math.max(1, current - 2);
    else if (action === 'done') next = Math.min(5, current + 1);
    if (next !== current) {
      curve[slot] = next;
      await supabaseAdmin.from('user_settings').update({ energy_curve: curve }).eq('user_id', userId);
    }
  }

  if (action === 'drop' && task_id) {
    // Remove from plan
    const { data: existing } = await supabaseAdmin
      .from('todos').select('todo').eq('user_id', userId).eq('date', day).single();
    if (existing?.todo) {
      const plan = existing.todo as { timeline?: { id: string }[] };
      plan.timeline = (plan.timeline || []).filter(b => b.id !== task_id);
      await supabaseAdmin.from('todos').update({ todo: plan }).eq('user_id', userId).eq('date', day);
    }
  }

  if (action === 'done' && task_id) {
    await supabaseAdmin.from('task_completions').upsert(
      { user_id: userId, task_id, date: day },
      { onConflict: 'user_id,task_id,date' }
    );
  }

  return NextResponse.json({ ok: true });
});
