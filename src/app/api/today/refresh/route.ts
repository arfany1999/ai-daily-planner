import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';
import { logError, getUserContext } from '@/lib/db';
import { generateWithClaude } from '@/lib/claude';

const TIMEZONE = 'Australia/Melbourne';

function getTodayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

export const POST = withAuth(async (_req, userId) => {
  const today = getTodayDate();

  try {
    const userContext = await getUserContext(userId);

    const [calRes, canvasRes, emailRes, semRes, settingsRes] = await Promise.all([
      supabaseAdmin.from('calendar_cache').select('data').eq('user_id', userId).single(),
      supabaseAdmin.from('canvas_cache').select('data').eq('user_id', userId).single(),
      supabaseAdmin.from('email_cache').select('data').eq('user_id', userId).single(),
      supabaseAdmin.from('semester_context').select('data').eq('user_id', userId).single(),
      supabaseAdmin.from('user_settings').select('domains, gym_days').eq('user_id', userId).single(),
    ]);

    const events = (calRes.data?.data || []) as { start: string }[];
    const canvas = canvasRes.data?.data || null;
    const emails = ((emailRes.data?.data || []) as { priority?: string }[]).filter(e => e.priority === 'HIGH');
    const semester = semRes.data?.data || null;
    const gymDays: string[] = (settingsRes.data as { gym_days?: string[] } | null)?.gym_days || [];

    // Filter calendar to only today + future
    const todayStart = new Date(today + 'T00:00:00').getTime();
    const todayEvents = events.filter(e => e.start && new Date(e.start).getTime() >= todayStart);

    const urgentDeadlines = (canvas?.assignments || []).filter((a: { due_at: string | null }) => {
      if (!a.due_at) return false;
      const days = Math.ceil((new Date(a.due_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return days >= 0 && days <= 5;
    });

    const systemPrompt = `${userContext}

COMMANDER SCHEDULING RULES:
1. Morning (6am–12pm): Deep work only — RMIT study, coding, writing. These are protected focus blocks.
2. Afternoon (12pm–6pm): Medium tasks — reviews, emails, lighter study, admin.
3. Evening (6pm–10pm): Gym, personal, wind-down.
4. Group similar tasks into 90-minute focus blocks. Add 15-min buffer between blocks.
5. Never schedule over fixed calendar events (classes, meetings, tutorials).
6. Weight deadline urgency: days_until_due × domain_weight. Lower score = higher priority.
7. Include meals (breakfast, lunch, dinner) as short break blocks.
8. If over-scheduled, push lowest-priority tasks and explain why.
9. Include university study blocks for any Canvas deadlines within 7 days.

Return ONLY valid JSON (no markdown):
{
  "timeline": [
    {
      "id": "unique-id",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "task_name": "Task name",
      "description": "Why this task, why now",
      "estimated_minutes": 90,
      "buffer_minutes": 15,
      "urgency": "red|amber|green|class|gym|work|break",
      "domain": "academia|dev|finance|gym|personal",
      "related_assignment": "assignment name or null",
      "carried_over": false
    }
  ],
  "top_priorities": ["Priority 1 reason", "Priority 2 reason", "Priority 3 reason"],
  "nudges": [
    {
      "type": "deadline|gym|habit|warning",
      "message": "Commander-style proactive message",
      "action_url": "/calendar"
    }
  ],
  "warnings": ["Warning if over-scheduled or conflicts exist"],
  "pushed": [{ "task_name": "...", "reason": "..." }],
  "summary": "One-line day overview"
}`;

    const dataMsg = `Generate the commander schedule for TODAY: ${today}.

CALENDAR (today + upcoming): ${JSON.stringify(todayEvents.slice(0, 30))}
${canvas ? `CANVAS DEADLINES: ${JSON.stringify(
  (canvas.assignments as { name: string; course_name: string; due_at: string | null }[])
    ?.filter(a => a.due_at)
    .map(a => ({
      name: a.name, course: a.course_name, due_at: a.due_at,
      days_until_due: Math.ceil((new Date(a.due_at!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    }))
    .sort((a, b) => a.days_until_due - b.days_until_due)
    .slice(0, 12)
)}` : ''}
${emails.length ? `HIGH-PRIORITY EMAILS: ${JSON.stringify(emails.slice(0, 5))}` : ''}
${semester ? `SEMESTER CONTEXT: ${JSON.stringify(semester)}` : ''}
${urgentDeadlines.length ? `⚠️ URGENT DEADLINES (≤5 days): ${JSON.stringify((urgentDeadlines as { name: string; due_at: string }[]).map(a => ({ name: a.name, due_at: a.due_at })))}` : ''}
${gymDays.length ? `GYM DAYS: ${gymDays.join(', ')}` : ''}`;

    const response = await generateWithClaude(systemPrompt, dataMsg, { maxTokens: 4096 });
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
    let todo;
    try {
      todo = JSON.parse(jsonMatch[1]?.trim() || response.trim());
    } catch {
      todo = { timeline: [], pushed: [], top_priorities: [], nudges: [], warnings: [], summary: 'Could not parse plan.' };
    }

    await supabaseAdmin.from('todos').upsert({
      user_id: userId,
      date: today,
      todo,
      created_at: new Date().toISOString(),
    }, { onConflict: 'user_id,date' });

    return NextResponse.json({ plan: todo, date: today });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await logError('api/today/refresh', msg, userId);
    return NextResponse.json({ error: 'Failed to refresh', message: msg }, { status: 500 });
  }
});
