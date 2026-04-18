import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { getClaudeClient, isAiAvailable } from '@/lib/claude';
import { AGENT_TOOLS, executeTool, logToolCall } from '@/lib/agent-tools';
import { supabaseAdmin } from '@/lib/supabase';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

const TZ = 'Australia/Melbourne';
const MAX_ITERATIONS = 8;
const MODEL = 'claude-sonnet-4-6';

const SYSTEM = `You are Commander, the AI agent for Hamidreza Arfany's daily planner.

Your job: solve the user's request end-to-end by calling tools, not by describing what you would do. Take action.

Context:
- Hamidreza is an RMIT pharmacy student, web developer (mrgren.store), crypto investor, gym-goer.
- Life domains: academia (RMIT/Canvas), dev (mrgren.store/GitHub), finance (crypto), health (gym), admin (personal), break (meals/rest).
- Timezone: ${TZ} (Melbourne).
- Energy curve: sharp mornings → deep work/study. Evening → gym/light tasks.

Rules:
1. Always check current state first (get_today_plan, get_calendar_events, get_canvas_deadlines) before creating/moving blocks.
2. Respect existing calendar events (classes, work shifts) — never overlap with them.
3. When the user says a vague time ("after lunch", "tonight"), resolve to a concrete HH:MM and commit.
4. Prefer 60–120 min blocks for deep work. 30 min for admin/email.
5. Use send_push_nudge ONLY for truly async moments (background run detected a new deadline). Not for immediate chat replies.
6. When done, write a 1–2 sentence summary of what you did and stop. No verbose explanation.
7. If you cannot act (user asked a question that doesn't require action), just answer concisely without calling tools.`;

interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export const POST = withAuth(async (req, userId) => {
  if (!isAiAvailable()) {
    return NextResponse.json({ error: 'AI unavailable' }, { status: 503 });
  }

  const rl = rateLimit(`agent:${userId}`, RATE_LIMITS.agent.limit, RATE_LIMITS.agent.windowMs);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many requests. Try again in a moment.', retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  const body = await req.json() as { message?: string; conversation?: Message[]; source?: string };
  const userMessage = (body.message || '').trim();
  if (!userMessage && !body.conversation?.length) {
    return NextResponse.json({ error: 'Empty message' }, { status: 400 });
  }

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-CA', { timeZone: TZ }); })();
  const ctx = `Current datetime context: today is ${today}, tomorrow is ${tomorrow}.`;

  const messages: Message[] = [
    ...(body.conversation || []),
    { role: 'user', content: userMessage ? `${ctx}\n\n${userMessage}` : ctx },
  ];

  const claude = getClaudeClient();
  const actions: { tool: string; input: unknown; result: unknown }[] = [];
  let iter = 0;
  let finalText = '';
  let stopReason = '';

  try {
    while (iter++ < MAX_ITERATIONS) {
      const response = await claude.messages.create({
        model: MODEL,
        max_tokens: 4096,
        // Cache the large static system prompt — ~90% discount on cache hits
        // within 5 min (every subsequent agent call by any user, same prompt).
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }] as unknown as string,
        tools: AGENT_TOOLS as unknown as Parameters<typeof claude.messages.create>[0]['tools'],
        messages: messages as unknown as Parameters<typeof claude.messages.create>[0]['messages'],
      });

      stopReason = response.stop_reason || '';
      const contentBlocks = response.content as unknown as ContentBlock[];
      messages.push({ role: 'assistant', content: contentBlocks });

      if (stopReason !== 'tool_use') {
        finalText = contentBlocks
          .filter(b => b.type === 'text')
          .map(b => b.text || '')
          .join('\n')
          .trim();
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

    if (!finalText) finalText = iter >= MAX_ITERATIONS ? '(agent reached step limit)' : '(done)';

    try {
      await supabaseAdmin.from('agent_runs').insert({
        id: runId,
        user_id: userId,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        summary: finalText.slice(0, 500),
        actions_count: actions.length,
        source: body.source || 'user',
      });
    } catch {}

    return NextResponse.json({
      run_id: runId,
      text: finalText,
      actions,
      iterations: iter,
      stop_reason: stopReason,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'agent-failed';
    try {
      await supabaseAdmin.from('agent_runs').insert({
        id: runId,
        user_id: userId,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        summary: `ERROR: ${msg}`,
        actions_count: actions.length,
        source: body.source || 'user',
      });
    } catch {}
    return NextResponse.json({ error: msg, actions }, { status: 500 });
  }
});
