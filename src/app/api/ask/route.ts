import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';
import { logError, getUserContext } from '@/lib/db';
import { buildContextText } from '@/lib/context-builder';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;
const TIMEZONE = 'Australia/Melbourne';

// ── Rate limit: 60 msgs/hr ────────────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + 3_600_000 });
    return true;
  }
  if (entry.count >= 60) return false;
  entry.count++;
  return true;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export const POST = withAuth(async (req: Request, userId) => {
  if (!checkRateLimit(userId)) {
    return NextResponse.json({ error: 'Rate limit exceeded. Maximum 60 messages per hour.' }, { status: 429 });
  }

  const { message, page_context, conversation } = await req.json();
  if (!message?.trim()) return NextResponse.json({ error: 'Message is required' }, { status: 400 });

  try {
    const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
    const nowLocal = new Date().toLocaleString('en-AU', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false });

    // Load user context + check for pre-built snapshot from last night's cron
    const [userContext, snapshotRes] = await Promise.all([
      getUserContext(userId),
      supabaseAdmin.from('briefings').select('briefing').eq('user_id', userId).eq('date', todayDate).single(),
    ]);

    // Use pre-built snapshot if available and < 18 hours old
    const preBuilt = (snapshotRes.data?.briefing as Record<string, unknown>)?.daily_context as
      { generated_at?: string; text?: string } | undefined;
    const ageMs = preBuilt?.generated_at ? Date.now() - new Date(preBuilt.generated_at).getTime() : Infinity;
    const EIGHTEEN_HOURS = 18 * 60 * 60 * 1000;

    let contextText: string;
    if (preBuilt?.text && ageMs < EIGHTEEN_HOURS) {
      contextText = preBuilt.text; // instant — pre-built at 9 PM last night
    } else {
      contextText = await buildContextText(userId, todayDate); // fresh read from caches (~50ms)
    }

    // ── System prompt ─────────────────────────────────────────────────────────
    const systemPrompt = `${userContext}

You are Hamidreza's personal AI commander. You have a live data snapshot — answer from it directly and accurately.

${contextText}

ANSWER RULES:
- Answer ONLY from the snapshot data — never make up personal info
- Use bullet points (•) for any list of 2+ items
- Lead with the most urgent or important item
- Max 7 bullets unless the user explicitly asks for more detail
- Include exact times, names, dates from the data
- No preamble ("Sure!", "Great question!") — get straight to the answer
- If something needs action (schedule, task, etc.), suggest it clearly
- Never say "I don't have access to..." — you have everything in the snapshot

Current page: ${page_context || 'home'}
Today: ${todayDate} | Time: ${nowLocal} Melbourne`;

    // ── Build conversation history ─────────────────────────────────────────────
    const messages: Anthropic.MessageParam[] = [];
    for (const m of (conversation || []).slice(-6)) {
      if (m.role === 'user' || m.role === 'assistant') {
        messages.push({ role: m.role, content: String(m.content) });
      }
    }
    messages.push({ role: 'user', content: message });

    // ── Single Claude call — no tool use, context is in system prompt ──────────
    const claude = (await import('@/lib/claude')).getClaudeClient();
    const response = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const finalText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    // Check if Claude wrapped in JSON for action support
    let responseMessage = finalText;
    let actions: unknown[] = [];
    try {
      const firstBrace = finalText.indexOf('{');
      const lastBrace = finalText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const parsed = JSON.parse(finalText.slice(firstBrace, lastBrace + 1));
        if (parsed.message) { responseMessage = parsed.message; actions = parsed.actions || []; }
      }
    } catch { /* raw text is fine */ }

    // Save conversation (fire-and-forget)
    void supabaseAdmin.from('ai_conversations').insert({
      user_id: userId,
      page_context: page_context || 'home',
      messages: [
        ...(conversation || []),
        { role: 'user', content: message, timestamp: new Date().toISOString() },
        { role: 'assistant', content: responseMessage, timestamp: new Date().toISOString() },
      ],
    });

    return NextResponse.json({ message: responseMessage, actions });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await logError('api/ask', msg, userId);
    return NextResponse.json({ error: 'Failed to process question', message: msg }, { status: 500 });
  }
});
