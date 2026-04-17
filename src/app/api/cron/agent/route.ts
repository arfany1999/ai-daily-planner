import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getClaudeClient, isAiAvailable } from '@/lib/claude';
import { AGENT_TOOLS, executeTool, logToolCall } from '@/lib/agent-tools';

const TZ = 'Australia/Melbourne';
const MODEL = 'claude-sonnet-4-6';
const MAX_ITERATIONS = 6;

const SYSTEM = `You are Commander, running in BACKGROUND mode.

Your job on each run:
1. Check Canvas for new/changed deadlines (get_canvas_deadlines).
2. Check the user's plan for today and the next 3 days (get_today_plan).
3. Check the calendar for the next 3 days (get_calendar_events).
4. Auto-resolve SMALL decisions:
   - New Canvas assignment detected with a deadline in <7 days AND no study block scheduled for it → create_block in a free slot during a morning energy window.
   - Obvious conflicts on today's plan → move_block to resolve.
5. For BIG decisions (>2 hours of work needed, cross-week reshuffle, overlapping fixed events) → send_push_nudge with a short summary.
6. Only use push when action is truly required. NEVER spam.
7. Keep actions minimal: 1-3 per run max. Better to do nothing than to over-schedule.
8. Respect agentic_mode setting in get_user_profile — if agentic_mode is false, prefer push over auto-edit for anything non-trivial.

When done, summarize in one sentence and stop.`;

interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}
interface Message { role: 'user' | 'assistant'; content: string | ContentBlock[]; }

async function runForUser(userId: string): Promise<{ summary: string; actions: unknown[]; error?: string }> {
  if (!isAiAvailable()) return { summary: 'ai-unavailable', actions: [] };

  const runId = crypto.randomUUID();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });

  const messages: Message[] = [{
    role: 'user',
    content: `Today: ${today} (${TZ}). Run your background check. Resolve small issues autonomously, push-notify big ones.`,
  }];

  const claude = getClaudeClient();
  const actions: unknown[] = [];
  let iter = 0;
  let finalText = '';

  try {
    while (iter++ < MAX_ITERATIONS) {
      const response = await claude.messages.create({
        model: MODEL,
        max_tokens: 2000,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }] as unknown as string,
        tools: AGENT_TOOLS as unknown as Parameters<typeof claude.messages.create>[0]['tools'],
        messages: messages as unknown as Parameters<typeof claude.messages.create>[0]['messages'],
      });

      const contentBlocks = response.content as unknown as ContentBlock[];
      messages.push({ role: 'assistant', content: contentBlocks });

      if (response.stop_reason !== 'tool_use') {
        finalText = contentBlocks
          .filter(b => b.type === 'text')
          .map(b => b.text || '').join(' ').trim();
        break;
      }

      const toolUses = contentBlocks.filter(b => b.type === 'tool_use');
      const toolResults: ContentBlock[] = [];
      for (const tu of toolUses) {
        const toolName = tu.name || '';
        const toolInput = tu.input || {};
        const result = await executeTool(userId, toolName, toolInput);
        await logToolCall(userId, runId, toolName, toolInput, result);
        actions.push({ tool: toolName, input: toolInput, result });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(result),
        } as unknown as ContentBlock);
      }
      messages.push({ role: 'user', content: toolResults });
    }

    try {
      await supabaseAdmin.from('agent_runs').insert({
        id: runId,
        user_id: userId,
        started_at: new Date(Date.now() - 1000).toISOString(),
        finished_at: new Date().toISOString(),
        summary: (finalText || 'background run complete').slice(0, 500),
        actions_count: actions.length,
        source: 'cron',
      });
    } catch {}

    return { summary: finalText || 'done', actions };
  } catch (e) {
    return { summary: 'error', actions, error: e instanceof Error ? e.message : 'failed' };
  }
}

/**
 * Daily background agent — iterates all opted-in users.
 * Invoked by Vercel cron via /api/cron/agent (requires x-vercel-cron header or bearer secret).
 */
export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  const cronHeader = req.headers.get('x-vercel-cron');
  if (cronHeader !== '1' && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: users } = await supabaseAdmin
    .from('user_settings')
    .select('user_id, agentic_mode');

  const results: { userId: string; summary: string; actions: number }[] = [];
  for (const u of users || []) {
    // Only run autonomous actions for users who explicitly enabled agentic mode.
    if (!u.agentic_mode) continue;
    const r = await runForUser(u.user_id);
    results.push({ userId: u.user_id, summary: r.summary, actions: r.actions.length });
  }

  return NextResponse.json({ ok: true, ran: results.length, results });
}

export const GET = POST;
