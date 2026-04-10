import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';
import { logError, getUserContext } from '@/lib/db';

// Rate limiting: max 30 messages per hour
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 30) return false;
  entry.count++;
  return true;
}

export const POST = withAuth(async (req: Request, userId) => {
  if (!checkRateLimit(userId)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Maximum 30 messages per hour. Try again later.' },
      { status: 429 }
    );
  }

  const { message, page_context, conversation } = await req.json();

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  try {
    // 1. LOAD ALL DATA
    const userContext = await getUserContext(userId);

    const { data: calendarCache } = await supabaseAdmin.from('calendar_cache').select('data').eq('user_id', userId).single();
    const events = calendarCache?.data || [];

    const { data: emailCache } = await supabaseAdmin.from('email_cache').select('data').eq('user_id', userId).single();
    const emails = emailCache?.data || [];

    const { data: canvasCache } = await supabaseAdmin.from('canvas_cache').select('data').eq('user_id', userId).single();
    const canvas = canvasCache?.data || null;

    const { data: materialsRows } = await supabaseAdmin
      .from('materials')
      .select('course, week, source_file')
      .eq('user_id', userId)
      .order('course')
      .order('week');

    const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
    const tomorrowDate = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' }); })();

    const { data: todayTodo } = await supabaseAdmin
      .from('todos')
      .select('todo')
      .eq('user_id', userId)
      .eq('date', tomorrowDate)
      .single();
    const todoData = todayTodo?.todo || null;

    const { data: completions } = await supabaseAdmin
      .from('task_completions')
      .select('task_id')
      .eq('user_id', userId)
      .gte('date', todayDate)
      .not('task_id', 'like', 'pushed_%')
      .order('created_at', { ascending: false })
      .limit(50);

    const { data: semesterRow } = await supabaseAdmin.from('semester_context').select('data').eq('user_id', userId).single();
    const semesterContext = semesterRow?.data || null;

    const { data: briefingRow } = await supabaseAdmin
      .from('briefings')
      .select('briefing')
      .eq('user_id', userId)
      .eq('date', todayDate)
      .single();
    const briefing = briefingRow?.briefing || null;

    const { data: prefsRows } = await supabaseAdmin.from('user_preferences').select('key, value').eq('user_id', userId);
    const preferences: Record<string, string> = {};
    for (const row of prefsRows || []) preferences[row.key] = row.value;

    // Custom connection results
    const { data: connRows } = await supabaseAdmin
      .from('custom_connections')
      .select('id, name, type')
      .eq('user_id', userId)
      .eq('enabled', true);

    const connectionResults: { name: string; type: string; result_text: string; fetched_at: string }[] = [];
    for (const conn of connRows || []) {
      const { data: result } = await supabaseAdmin
        .from('connection_results')
        .select('result_text, fetched_at')
        .eq('connection_id', conn.id)
        .order('fetched_at', { ascending: false })
        .limit(1)
        .single();
      if (result) connectionResults.push({ name: conn.name, type: conn.type, result_text: result.result_text, fetched_at: result.fetched_at });
    }

    // 2. BUILD SYSTEM PROMPT
    const systemPrompt = `${userContext}

You have LIVE access to ALL the user's data (provided below).

User preferences: ${JSON.stringify(preferences)}

Answer using the user's REAL data \u2014 never be vague. Give exact names, dates, times.

Current page: ${page_context || 'home'} \u2014 weight your answers toward this context.

You can return ACTIONS when the user asks you to do something.
Return JSON: { "message": "your response", "actions": [...], "preference_update": {...} }

Action types:
- { "type": "schedule", "title": "...", "date": "YYYY-MM-DD", "start_time": "HH:MM", "end_time": "HH:MM", "description": "..." }
- { "type": "complete_task", "task_id": "..." }
- { "type": "push_task", "task_id": "..." }
- { "type": "generate_materials", "course": "...", "week": 0 }
- { "type": "refresh_connection", "connection_id": 0 }

Preference updates: if user says "I don't like studying before 10 AM", return:
{ "key": "no_study_before", "value": "10:00" }
These are saved and included in future prompts.

If the user's question doesn't need an action, just return: { "message": "your response" }

IMPORTANT: Always return valid JSON. The "message" field is what gets displayed to the user.`;

    // 3. BUILD DATA CONTEXT
    const dataContext = `LIVE DATA:

CALENDAR (next 7 days): ${JSON.stringify((events as unknown[]).slice(0, 20))}

EMAILS (last 24h): ${JSON.stringify((emails as unknown[]).slice(0, 10))}

${canvas ? `CANVAS:
- Courses: ${canvas.courses?.map((c: { name: string }) => c.name).join(', ')}
- Assignments: ${JSON.stringify(canvas.assignments?.slice(0, 10).map((a: { name: string; course_name: string; due_at: string | null }) => ({ name: a.name, course: a.course_name, due: a.due_at })))}
- Recent announcements: ${canvas.announcements?.slice(0, 5).map((a: { title: string; course_name: string }) => `${a.course_name}: ${a.title}`).join('; ')}` : 'CANVAS: Not connected.'}

STUDY MATERIALS INDEX: ${(materialsRows || []).map((m) => `${m.course} Wk${m.week}: ${m.source_file}`).join(', ') || 'None generated yet.'}

TOMORROW'S TO-DO: ${todoData ? JSON.stringify((todoData as { timeline?: unknown[] }).timeline?.slice(0, 10)) : 'Not generated yet.'}

TASK COMPLETIONS (recent): ${(completions || []).map((c) => c.task_id).join(', ') || 'None.'}

${semesterContext ? `SEMESTER CONTEXT: ${JSON.stringify(semesterContext)}` : ''}

${briefing ? `CURRENT BRIEFING SUMMARY: ${(briefing as { summary?: string }).summary || ''}` : ''}

${connectionResults.length > 0 ? `CUSTOM CONNECTIONS:\n${connectionResults.map((c) => `${c.name} (${c.type}): ${c.result_text?.slice(0, 200)}`).join('\n')}` : ''}

Today: ${todayDate}`;

    // Build conversation history
    const messages: { role: 'user' | 'assistant'; content: string }[] = [];
    if (conversation && Array.isArray(conversation)) {
      for (const msg of conversation.slice(-10)) {
        messages.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content });
      }
    }
    messages.push({ role: 'user', content: `${dataContext}\n\nUSER MESSAGE: ${message}` });

    // 3. SEND TO CLAUDE
    const claude = (await import('@/lib/claude')).getClaudeClient();
    const response = await claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    });

    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';

    // 4. PARSE RESPONSE
    let parsed: { message: string; actions?: unknown[]; preference_update?: { key: string; value: string } };

    try {
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText];
      const jsonStr = jsonMatch[1]?.trim() || responseText.trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      // Not JSON \u2014 treat as plain text response
      parsed = { message: responseText };
    }

    // 5. SAVE PREFERENCE UPDATE
    if (parsed.preference_update?.key) {
      await supabaseAdmin.from('user_preferences').upsert({
        user_id: userId,
        key: parsed.preference_update.key,
        value: parsed.preference_update.value,
      }, { onConflict: 'user_id,key' });
    }

    // 6. SAVE CONVERSATION
    const conversationEntry = [
      ...(conversation || []),
      { role: 'user', content: message, timestamp: new Date().toISOString() },
      { role: 'assistant', content: parsed.message, timestamp: new Date().toISOString() },
    ];

    await supabaseAdmin.from('ai_conversations').insert({
      user_id: userId,
      page_context: page_context || 'home',
      messages: conversationEntry,
    });

    return NextResponse.json({
      message: parsed.message,
      actions: parsed.actions || [],
      preference_update: parsed.preference_update || null,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await logError('api/ask', msg, userId);
    return NextResponse.json({ error: 'Failed to process question', message: msg }, { status: 500 });
  }
});
