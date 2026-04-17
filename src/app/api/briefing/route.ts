import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';
import { logError, getUserContext } from '@/lib/db';
import { generateWithClaude } from '@/lib/claude';

const TIMEZONE = 'Australia/Melbourne';

function getTodayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

function getDefaultPrompt(): string {
  return "Generate a rolling 7-day briefing with day-by-day breakdown, deadlines, email highlights woven in, and priority actions.";
}

function isFresh(createdAt: string, maxAgeHours: number): boolean {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  return (now - created) < maxAgeHours * 60 * 60 * 1000;
}

export const GET = withAuth(async (_req, userId) => {
  const today = getTodayDate();

  try {
    // Check for cached briefing (less than 4 hours old)
    const { data: cached } = await supabaseAdmin
      .from('briefings')
      .select('briefing, created_at')
      .eq('user_id', userId)
      .eq('date', today)
      .single();

    if (cached && isFresh(cached.created_at, 4)) {
      return NextResponse.json({ briefing: cached.briefing, cached: true, stale: false }, { headers: { "Cache-Control": "private, max-age=120, stale-while-revalidate=600" } });
    }

    // Generate fresh briefing
    const briefing = await generateBriefing(userId);

    // Save to database
    await supabaseAdmin.from('briefings').upsert({
      user_id: userId,
      date: today,
      briefing,
      created_at: new Date().toISOString(),
    }, { onConflict: 'user_id,date' });

    return NextResponse.json({ briefing, cached: false, stale: false }, { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await logError('api/briefing', msg, userId);

    // Try returning stale cache
    const { data: stale } = await supabaseAdmin
      .from('briefings')
      .select('briefing')
      .eq('user_id', userId)
      .eq('date', today)
      .single();
    if (stale) {
      return NextResponse.json({ briefing: stale.briefing, cached: true, stale: true });
    }

    return NextResponse.json({ error: 'Failed to generate briefing', message: msg }, { status: 500 });
  }
});

async function generateBriefing(userId: string) {
  const userContext = await getUserContext(userId);

  // Load calendar events
  const { data: calendarCache } = await supabaseAdmin.from('calendar_cache').select('data').eq('user_id', userId).single();
  const events = calendarCache?.data || [];

  // Load emails
  const { data: emailCache } = await supabaseAdmin.from('email_cache').select('data').eq('user_id', userId).single();
  const emails = emailCache?.data || [];

  // Load Canvas data
  const { data: canvasCache } = await supabaseAdmin.from('canvas_cache').select('data').eq('user_id', userId).single();
  const canvas = canvasCache?.data || null;

  // Load semester context (accumulated intelligence)
  const { data: semesterRow } = await supabaseAdmin.from('semester_context').select('data').eq('user_id', userId).single();
  const semesterContext = semesterRow?.data || null;

  // Load custom connection results with in_email=true
  const { data: connRows } = await supabaseAdmin
    .from('custom_connections')
    .select('id, name')
    .eq('user_id', userId)
    .eq('enabled', true)
    .eq('in_email', true);

  const connectionResults: { name: string; result_text: string }[] = [];
  for (const conn of connRows || []) {
    const { data: result } = await supabaseAdmin
      .from('connection_results')
      .select('result_text')
      .eq('connection_id', conn.id)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .single();
    if (result) connectionResults.push({ name: conn.name, result_text: result.result_text });
  }

  // Get custom prompt
  const { data: promptRow } = await supabaseAdmin
    .from('card_prompts')
    .select('prompt_text')
    .eq('user_id', userId)
    .eq('card_key', 'weekly')
    .single();
  const customPrompt = promptRow?.prompt_text || getDefaultPrompt();

  const systemPrompt = `${userContext}

${customPrompt}

IMPORTANT: Emails must be WOVEN INTO the day-by-day breakdown, not listed as a separate section.

ANNOUNCEMENT INTELLIGENCE: When Canvas announcements are included, INTERPRET them:
- "No class Friday" or "Hey guys, no prac this Fri!" \u2192 flag as cancelled, suggest freed time use
- "Deadline extended" \u2192 update deadline, recalculate urgency
- "Exam format changed" \u2192 flag prominently as warning
- Understand informal language from lecturers

Return valid JSON with this structure:
{
  "summary": "Brief overview of the week",
  "days": [
    {
      "date": "YYYY-MM-DD",
      "day_label": "Day, DD Mon",
      "highlights": ["key point 1", "key point 2"],
      "events": [{ "time": "HH:MM AM/PM", "title": "...", "type": "class|work|gym|ai|other" }],
      "deadlines": ["deadline description"],
      "email_highlights": ["email highlight woven into context"],
      "priority_actions": ["action 1"]
    }
  ],
  "week_priorities": ["top priority 1", "top priority 2"],
  "semester_updates": {
    "cancelled_classes": [{ "class": "...", "date": "YYYY-MM-DD", "source": "announcement title" }],
    "deadline_changes": [{ "assignment": "...", "old_date": "...", "new_date": "...", "source": "..." }],
    "warnings": [{ "message": "...", "urgency": "high|medium", "source": "..." }]
  }
}`;

  const dataMessage = `Here is my current data. Generate this week's briefing.

CALENDAR EVENTS (next 7 days):
${JSON.stringify(events, null, 2)}

EMAILS (last 24 hours):
${JSON.stringify(emails, null, 2)}

${canvas ? `CANVAS DATA (assignments with countdown, announcements, new uploads):\n${JSON.stringify({
  assignments: canvas.assignments?.map((a: { name: string; course_name: string; due_at: string | null; has_submitted_submissions: boolean }) => ({
    name: a.name,
    course: a.course_name,
    due_at: a.due_at,
    submitted: a.has_submitted_submissions,
    days_until_due: a.due_at ? Math.ceil((new Date(a.due_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null,
  })),
  announcements: canvas.announcements?.slice(0, 10),
}, null, 2)}\nIMPORTANT: Assignment deadlines MUST appear in the day-by-day breakdown on their due date.` : 'CANVAS: Not connected yet.'}

${semesterContext ? `SEMESTER CONTEXT (accumulated intelligence):\n${JSON.stringify(semesterContext, null, 2)}` : ''}

${connectionResults.length > 0 ? `CUSTOM CONNECTIONS:\n${connectionResults.map((c) => `${c.name}: ${c.result_text}`).join('\n')}` : ''}

Today is ${new Date().toLocaleDateString('en-AU', { timeZone: TIMEZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} (${getTodayDate()}). Generate the briefing starting from TODAY (include today's remaining events).`;

  const response = await generateWithClaude(systemPrompt, dataMessage, { maxTokens: 4096, cacheSystem: true });

  // Parse JSON from response (handle markdown code blocks)
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
  const jsonStr = jsonMatch[1]?.trim() || response.trim();

  try {
    const briefing = JSON.parse(jsonStr);

    // Save semester_updates to semester_context (accumulated intelligence)
    if (briefing.semester_updates) {
      const existing = semesterContext || { cancelled_classes: [], deadline_changes: [], warnings: [] };
      const updates = briefing.semester_updates;

      // Merge new entries (avoid duplicates by source)
      const existingSources = new Set([
        ...(existing.cancelled_classes || []).map((c: { source: string }) => c.source),
        ...(existing.deadline_changes || []).map((d: { source: string }) => d.source),
        ...(existing.warnings || []).map((w: { source: string }) => w.source),
      ]);

      const merged = {
        cancelled_classes: [
          ...(existing.cancelled_classes || []),
          ...(updates.cancelled_classes || []).filter((c: { source: string }) => !existingSources.has(c.source)),
        ],
        deadline_changes: [
          ...(existing.deadline_changes || []),
          ...(updates.deadline_changes || []).filter((d: { source: string }) => !existingSources.has(d.source)),
        ],
        warnings: [
          ...(existing.warnings || []),
          ...(updates.warnings || []).filter((w: { source: string }) => !existingSources.has(w.source)),
        ],
        updated_at: new Date().toISOString(),
      };

      await supabaseAdmin.from('semester_context').upsert({
        user_id: userId,
        data: merged,
      }, { onConflict: 'user_id' });
    }

    return briefing;
  } catch {
    // If JSON parse fails, return raw text as a fallback structure
    await logError('api/briefing/parse', 'Failed to parse Claude response as JSON', userId);
    return {
      summary: response.slice(0, 200),
      days: [],
      week_priorities: [],
      raw: response,
    };
  }
}
