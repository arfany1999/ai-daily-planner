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

    // Delete cached briefing to force regeneration
    await supabaseAdmin.from('briefings').delete().eq('user_id', userId).eq('date', today);

    // Load all data (same as GET route)
    const { data: calendarCache } = await supabaseAdmin.from('calendar_cache').select('data').eq('user_id', userId).single();
    const events = calendarCache?.data || [];

    const { data: emailCache } = await supabaseAdmin.from('email_cache').select('data').eq('user_id', userId).single();
    const emails = emailCache?.data || [];

    const { data: canvasCache } = await supabaseAdmin.from('canvas_cache').select('data').eq('user_id', userId).single();
    const canvas = canvasCache?.data || null;

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

    const { data: promptRow } = await supabaseAdmin
      .from('card_prompts')
      .select('prompt_text')
      .eq('user_id', userId)
      .eq('card_key', 'weekly')
      .single();
    const customPrompt = promptRow?.prompt_text || "Generate a rolling 7-day briefing with day-by-day breakdown, deadlines, email highlights woven in, and priority actions.";

    const systemPrompt = `${userContext}

${customPrompt}

IMPORTANT: Emails must be WOVEN INTO the day-by-day breakdown, not listed as a separate section.
Return valid JSON with this structure:
{
  "summary": "Brief overview of the week",
  "days": [
    {
      "date": "YYYY-MM-DD",
      "day_label": "Day, DD Mon",
      "highlights": ["key point 1"],
      "events": [{ "time": "HH:MM AM/PM", "title": "...", "type": "class|work|gym|ai|other" }],
      "deadlines": ["deadline description"],
      "email_highlights": ["email highlight woven into context"],
      "priority_actions": ["action 1"]
    }
  ],
  "week_priorities": ["top priority 1", "top priority 2"]
}`;

    const dataMessage = `FORCE REFRESH requested. Generate a completely fresh briefing.

CALENDAR EVENTS (next 7 days):
${JSON.stringify(events, null, 2)}

EMAILS (last 24 hours):
${JSON.stringify(emails, null, 2)}

${canvas ? `CANVAS DATA:\n${JSON.stringify(canvas, null, 2)}` : 'CANVAS: Not connected yet.'}

${connectionResults.length > 0 ? `CUSTOM CONNECTIONS:\n${connectionResults.map((c) => `${c.name}: ${c.result_text}`).join('\n')}` : ''}

Today is ${new Date().toLocaleDateString('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} (${today}). Generate the briefing starting from tomorrow.`;

    const response = await generateWithClaude(systemPrompt, dataMessage, { maxTokens: 4096, cacheSystem: true });

    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
    const jsonStr = jsonMatch[1]?.trim() || response.trim();

    let briefing;
    try {
      briefing = JSON.parse(jsonStr);
    } catch {
      await logError('api/briefing/refresh/parse', 'Failed to parse Claude response as JSON', userId);
      briefing = { summary: response.slice(0, 200), days: [], week_priorities: [], raw: response };
    }

    // Save to database
    await supabaseAdmin.from('briefings').upsert({
      user_id: userId,
      date: today,
      briefing,
      created_at: new Date().toISOString(),
    }, { onConflict: 'user_id,date' });

    return NextResponse.json({ briefing, cached: false, stale: false });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await logError('api/briefing/refresh', msg, userId);
    return NextResponse.json({ error: 'Failed to refresh briefing', message: msg }, { status: 500 });
  }
});
