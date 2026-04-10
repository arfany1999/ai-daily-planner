import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';
import { logError, getUserContext } from '@/lib/db';
import { generateWithClaude } from '@/lib/claude';

export const POST = withAuth(async (_req, userId) => {
  try {
    const userContext = await getUserContext(userId);

    // Load calendar events
    const { data: calendarCache } = await supabaseAdmin.from('calendar_cache').select('data').eq('user_id', userId).single();
    const events = calendarCache?.data || [];

    // Load Canvas assignments
    const { data: canvasCache } = await supabaseAdmin.from('canvas_cache').select('data').eq('user_id', userId).single();
    const canvas = canvasCache?.data || null;
    const assignments = canvas?.assignments?.map((a: { name: string; course_name: string; due_at: string | null }) => ({
      name: a.name,
      course: a.course_name,
      due_at: a.due_at,
      days_until_due: a.due_at ? Math.ceil((new Date(a.due_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null,
    })).filter((a: { days_until_due: number | null }) => a.days_until_due !== null && a.days_until_due > 0 && a.days_until_due <= 14) || [];

    // Load semester context
    const { data: semesterRow } = await supabaseAdmin.from('semester_context').select('data').eq('user_id', userId).single();
    const semesterContext = semesterRow?.data || null;

    // Get custom prompt
    const { data: promptRow } = await supabaseAdmin
      .from('card_prompts')
      .select('prompt_text')
      .eq('user_id', userId)
      .eq('card_key', 'calendar')
      .single();
    const customPrompt = promptRow?.prompt_text ||
      "Suggest study sessions in free slots. 30min\u20132hr, max 3/day, prefer AM/PM, next 3 days only. Never over work/gym. Title: [AI].";

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });

    const systemPrompt = `${userContext}

${customPrompt}

RULES:
- Respect the user's schedule settings above \u2014 NEVER double-book work or gym
- Sessions should be 30 min to 2 hours
- Maximum 3 study sessions per day
- Prefer morning and afternoon slots
- Only suggest for the NEXT 3 DAYS from today (${today})
- Add breaks every 2 hours
- Prioritize by assignment deadline urgency
- Title format: [AI] Study: <topic>

${semesterContext ? `SEMESTER CONTEXT (cancelled classes, deadline changes):\n${JSON.stringify(semesterContext, null, 2)}` : ''}

Return ONLY valid JSON array:
[
  {
    "title": "[AI] Study: <topic>",
    "date": "YYYY-MM-DD",
    "start_time": "HH:MM",
    "end_time": "HH:MM",
    "description": "What to focus on and why",
    "reason": "Why this time slot and topic"
  }
]`;

    const userMsg = `Suggest study sessions for the next 3 days.

TODAY: ${today}

EXISTING CALENDAR EVENTS (next 7 days):
${JSON.stringify(events, null, 2)}

UPCOMING ASSIGNMENTS:
${JSON.stringify(assignments, null, 2)}

Generate smart study session suggestions that fit around my existing schedule.`;

    const response = await generateWithClaude(systemPrompt, userMsg, { maxTokens: 2048 });

    // Parse JSON
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
    const jsonStr = jsonMatch[1]?.trim() || response.trim();

    let suggestions;
    try {
      suggestions = JSON.parse(jsonStr);
    } catch {
      await logError('schedule/suggest/parse', 'Failed to parse Claude response', userId);
      suggestions = [];
    }

    // Ensure it's an array
    if (!Array.isArray(suggestions)) {
      suggestions = suggestions?.suggestions || suggestions?.events || [];
    }

    return NextResponse.json({ suggestions });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await logError('schedule/suggest', msg, userId);
    return NextResponse.json({ error: 'Failed to generate suggestions', message: msg }, { status: 500 });
  }
});
