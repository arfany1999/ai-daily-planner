import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';
import { generateWithClaude, isAiAvailable } from '@/lib/claude';

const TZ = 'Australia/Melbourne';

interface Cmd {
  intent: string;
  title?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  duration_min?: number;
  domain?: string;
  raw?: string;
}

interface TimelineBlock {
  id: string;
  task_name: string;
  start_time: string;
  end_time: string;
  urgency?: string;
  domain?: string;
  description?: string;
}

const SYSTEM = `You apply reschedule changes. Given the current plan and user's request, return the full new timeline as JSON.

Return: { "timeline": [ ... ] } — the full ordered list of blocks (HH:MM 24h).`;

export const POST = withAuth(async (req, userId) => {
  const cmd = await req.json() as Cmd;

  if (!isAiAvailable()) {
    return NextResponse.json({
      success: false, ai_unavailable: true,
      error: 'AI is disabled. Move the block manually.',
    }, { status: 503 });
  }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const targetDate = cmd.date || today;

  const { data: existing } = await supabaseAdmin
    .from('todos').select('todo').eq('user_id', userId).eq('date', targetDate).single();
  const plan = (existing?.todo as { timeline?: TimelineBlock[] } & Record<string, unknown>) || { timeline: [] };

  const userMsg = `User request: "${cmd.raw || cmd.title || ''}"
Parsed: ${JSON.stringify(cmd)}
Current timeline for ${targetDate}:
${JSON.stringify(plan.timeline || [], null, 2)}

Return the updated timeline as JSON { "timeline": [...] }. Preserve ids where possible.`;

  try {
    const raw = await generateWithClaude(SYSTEM, userMsg, {
      model: 'claude-sonnet-4-20250514',
      maxTokens: 2000,
    });
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const { timeline } = JSON.parse(cleaned) as { timeline: TimelineBlock[] };
    const newPlan = { ...plan, timeline };
    await supabaseAdmin.from('todos').upsert(
      { user_id: userId, date: targetDate, todo: newPlan },
      { onConflict: 'user_id,date' }
    );
    return NextResponse.json({ success: true, plan: newPlan });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'apply-failed';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
});
