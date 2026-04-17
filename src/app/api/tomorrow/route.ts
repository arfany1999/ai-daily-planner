import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';
import { logError, getUserContext } from '@/lib/db';
import { generateWithClaude } from '@/lib/claude';

const TIMEZONE = 'Australia/Melbourne';

function getTomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

function getTodayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

function isFresh(createdAt: string, maxAgeHours: number): boolean {
  const created = new Date(createdAt).getTime();
  return (Date.now() - created) < maxAgeHours * 60 * 60 * 1000;
}

export const GET = withAuth(async (_req, userId) => {
  const tomorrow = getTomorrowDate();

  try {
    // Check cache (less than 4 hours old)
    const { data: cached } = await supabaseAdmin
      .from('todos')
      .select('todo, created_at')
      .eq('user_id', userId)
      .eq('date', tomorrow)
      .single();

    if (cached && isFresh(cached.created_at, 4)) {
      return NextResponse.json({ todo: cached.todo, cached: true, stale: false });
    }

    const todo = await generateTodo(userId, tomorrow);

    await supabaseAdmin.from('todos').upsert({
      user_id: userId,
      date: tomorrow,
      todo,
      created_at: new Date().toISOString(),
    }, { onConflict: 'user_id,date' });

    return NextResponse.json({ todo, cached: false, stale: false });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await logError('api/tomorrow', msg, userId);

    const { data: stale } = await supabaseAdmin
      .from('todos')
      .select('todo')
      .eq('user_id', userId)
      .eq('date', tomorrow)
      .single();
    if (stale) {
      return NextResponse.json({ todo: stale.todo, cached: true, stale: true });
    }
    return NextResponse.json({ error: 'Failed to generate to-do', message: msg }, { status: 500 });
  }
});

async function generateTodo(userId: string, tomorrowDate: string) {
  const userContext = await getUserContext(userId);
  const today = getTodayDate();

  // Load all data
  const { data: calendarCache } = await supabaseAdmin.from('calendar_cache').select('data').eq('user_id', userId).single();
  const events = calendarCache?.data || [];

  const { data: canvasCache } = await supabaseAdmin.from('canvas_cache').select('data').eq('user_id', userId).single();
  const canvas = canvasCache?.data || null;

  const { data: emailCache } = await supabaseAdmin.from('email_cache').select('data').eq('user_id', userId).single();
  const emails = emailCache?.data || [];

  const { data: semesterRow } = await supabaseAdmin.from('semester_context').select('data').eq('user_id', userId).single();
  const semesterContext = semesterRow?.data || null;

  // Materials index (course/week/topics, not full content)
  const { data: materialsRows } = await supabaseAdmin
    .from('materials')
    .select('course, week, source_file')
    .eq('user_id', userId);

  // Yesterday's task completions
  const { data: yesterdayCompletions } = await supabaseAdmin
    .from('task_completions')
    .select('task_id, date')
    .eq('user_id', userId)
    .eq('date', today);
  const completedTaskIds = new Set((yesterdayCompletions || []).map((c) => c.task_id));

  // Yesterday's todo (to know what was planned)
  const { data: yesterdayTodo } = await supabaseAdmin
    .from('todos')
    .select('todo')
    .eq('user_id', userId)
    .eq('date', today)
    .single();
  const yesterdayTasks = yesterdayTodo?.todo || null;

  // User preferences
  const { data: prefsRows } = await supabaseAdmin
    .from('user_preferences')
    .select('key, value')
    .eq('user_id', userId);
  const preferences: Record<string, string> = {};
  for (const row of prefsRows || []) preferences[row.key] = row.value;

  // Custom prompt
  const { data: promptRow } = await supabaseAdmin
    .from('card_prompts')
    .select('prompt_text')
    .eq('user_id', userId)
    .eq('card_key', 'tomorrow')
    .single();
  const customPrompt = promptRow?.prompt_text ||
    "Create tomorrow\u2019s to-do. Estimate each task + 30 min buffer. Respect work/gym schedule. Carry forward incomplete tasks.";

  const systemPrompt = `${userContext}

${Object.keys(preferences).length > 0 ? `USER PREFERENCES:\n${Object.entries(preferences).map(([k, v]) => `- ${k}: ${v}`).join('\n')}` : ''}

${customPrompt}

RULES:
- Add 30 min buffer to every task estimate
- If not enough time, prioritise by deadline proximity, include pushed_to_next_day list
- Breaks every 2 hours
- Don't re-assign tasks that were already completed today
- Carry forward incomplete tasks with "carried_over: true" and higher priority
- Respect the user's configurable schedule (work/gym blocks)

Return ONLY valid JSON:
{
  "timeline": [
    {
      "id": "unique-id",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "task_name": "...",
      "description": "...",
      "estimated_minutes": 60,
      "buffer_minutes": 30,
      "urgency": "red|amber|green|class|gym|work|break",
      "related_assignment": "assignment name or null",
      "related_materials": "course/week or null",
      "carried_over": false
    }
  ],
  "pushed": [
    { "task_name": "...", "reason": "..." }
  ],
  "summary": "Brief overview of the day"
}`;

  const incompleteInfo = yesterdayTasks?.timeline
    ? yesterdayTasks.timeline
        .filter((t: { id: string }) => !completedTaskIds.has(t.id))
        .filter((t: { urgency: string }) => !['class', 'gym', 'work', 'break'].includes(t.urgency))
        .map((t: { task_name: string; description: string; urgency: string }) => ({
          task_name: t.task_name,
          description: t.description,
          urgency: t.urgency,
          was_incomplete: true,
        }))
    : [];

  const userMsg = `Generate tomorrow's to-do list.

TOMORROW: ${tomorrowDate}

CALENDAR EVENTS (next 7 days):
${JSON.stringify(events, null, 2)}

${canvas ? `ASSIGNMENTS:\n${JSON.stringify(
  canvas.assignments?.filter((a: { due_at: string | null }) => a.due_at).map((a: { name: string; course_name: string; due_at: string }) => ({
    name: a.name, course: a.course_name, due_at: a.due_at,
    days_until_due: Math.ceil((new Date(a.due_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  })),
  null, 2
)}` : ''}

EMAILS (last 24h, HIGH priority):
${JSON.stringify((emails as { priority: string }[]).filter((e) => e.priority === 'HIGH').slice(0, 5), null, 2)}

${(materialsRows || []).length > 0 ? `AVAILABLE STUDY MATERIALS:\n${(materialsRows || []).map((m) => `${m.course} Week ${m.week}: ${m.source_file}`).join('\n')}` : ''}

${semesterContext ? `SEMESTER CONTEXT:\n${JSON.stringify(semesterContext, null, 2)}` : ''}

YESTERDAY'S COMPLETION DATA:
- Completed: ${(yesterdayCompletions || []).length} tasks (IDs: ${[...completedTaskIds].join(', ') || 'none'})
- Incomplete (carry forward these): ${JSON.stringify(incompleteInfo)}

Generate the to-do for ${(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-AU', { timeZone: TIMEZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); })()} (${tomorrowDate}).`;

  const response = await generateWithClaude(systemPrompt, userMsg, { maxTokens: 4096, cacheSystem: true });

  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
  const jsonStr = jsonMatch[1]?.trim() || response.trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    await logError('api/tomorrow/parse', 'Failed to parse Claude response', userId);
    return { timeline: [], pushed: [], summary: response.slice(0, 200), raw: response };
  }
}
