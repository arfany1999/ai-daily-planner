import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';
import { logError } from '@/lib/db';
import { generateWithClaude } from '@/lib/claude';

const TIMEZONE = 'Australia/Melbourne';

function getTomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

export const POST = withAuth(async (_req, userId) => {
  const tomorrow = getTomorrowDate();

  try {
    // Delete cached to force regeneration
    await supabaseAdmin.from('todos').delete().eq('user_id', userId).eq('date', tomorrow);

    // Inline generation
    const { data: calendarCache } = await supabaseAdmin.from('calendar_cache').select('data').eq('user_id', userId).single();
    const events = calendarCache?.data || [];

    const { data: settingsData } = await supabaseAdmin.from('user_settings').select('*').eq('user_id', userId).single();
    const settings: Record<string, unknown> = settingsData || {};

    const response = await generateWithClaude(
      `Generate a to-do list for ${tomorrow}. Work: ${JSON.stringify(settings.work_days)} ${settings.work_start}-${settings.work_end}. Gym: ${JSON.stringify(settings.gym_days)} ${settings.gym_start}-${settings.gym_end}. Return JSON: { "timeline": [{ "id": "t1", "start_time": "HH:MM", "end_time": "HH:MM", "task_name": "...", "urgency": "green", "estimated_minutes": 60, "buffer_minutes": 30, "carried_over": false }], "pushed": [], "summary": "..." }`,
      `Calendar: ${JSON.stringify((events as unknown[]).slice(0, 10))}. Date: ${tomorrow}`,
      { maxTokens: 2048 }
    );

    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
    const jsonStr = jsonMatch[1]?.trim() || response.trim();

    let todo;
    try { todo = JSON.parse(jsonStr); } catch { todo = { timeline: [], pushed: [], summary: 'Refresh failed' }; }

    await supabaseAdmin.from('todos').upsert({
      user_id: userId,
      date: tomorrow,
      todo,
      created_at: new Date().toISOString(),
    }, { onConflict: 'user_id,date' });

    return NextResponse.json({ todo, cached: false, stale: false });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await logError('api/tomorrow/refresh', msg, userId);
    return NextResponse.json({ error: 'Failed to refresh', message: msg }, { status: 500 });
  }
});
