import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/options';
import { supabaseAdmin } from '@/lib/supabase';
import { buildContextText } from '@/lib/context-builder';
import { getUserContext } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;
const TIMEZONE = 'Australia/Melbourne';

// ── Rate limit (shared across module instances) ────────────────────────────
const rlMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rlMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rlMap.set(userId, { count: 1, resetAt: now + 3_600_000 });
    return true;
  }
  if (entry.count >= 60) return false;
  entry.count++;
  return true;
}

// ── Streaming SSE handler ──────────────────────────────────────────────────
export async function POST(req: Request) {
  // Auth
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  const userId = (session as unknown as Record<string, unknown>)?.userId as string | undefined;
  if (!email || !userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!checkRateLimit(userId)) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded. Maximum 60 messages per hour.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { message, page_context, conversation } = await req.json() as {
    message: string;
    page_context?: string;
    conversation?: { role: string; content: string }[];
  };
  if (!message?.trim()) return new Response('Message required', { status: 400 });

  const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
  const nowLocal = new Date().toLocaleString('en-AU', {
    timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false,
  });

  // Load context (pre-built snapshot or live)
  const [userContext, snapshotRes] = await Promise.all([
    getUserContext(userId),
    supabaseAdmin.from('briefings').select('briefing').eq('user_id', userId).eq('date', todayDate).single(),
  ]);

  const preBuilt = (snapshotRes.data?.briefing as Record<string, unknown>)?.daily_context as
    { generated_at?: string; text?: string } | undefined;
  const ageMs = preBuilt?.generated_at
    ? Date.now() - new Date(preBuilt.generated_at).getTime()
    : Infinity;
  const EIGHTEEN_HOURS = 18 * 60 * 60 * 1000;

  const contextText = preBuilt?.text && ageMs < EIGHTEEN_HOURS
    ? preBuilt.text
    : await buildContextText(userId, todayDate);

  const systemPrompt = `${userContext}

You are Hamidreza's personal AI Chief of Staff — an elite intelligence analyst who reads ALL available data, cross-references sources, and surfaces what actually matters. You don't just repeat data; you reason, infer, and connect dots.

${contextText}

INTELLIGENCE RULES — HOW TO THINK:
1. READ EVERYTHING before answering — calendar, Canvas assignments, announcements, emails, today's plan
2. CROSS-REFERENCE aggressively:
   - An announcement mentioning "quiz Friday" means there IS a quiz on Friday — even if it's not in assignments
   - An email about "deadline reminder" means check what deadline it refers to
   - A calendar event named "BIOL tutorial" combined with an announcement about "lab quiz this week" = quiz likely IN that tutorial
   - If Canvas has no assignment entry but the announcement text describes one — that assessment IS real and you must flag it
3. INFER with confidence: if 3 sources point to the same event, report it as fact
4. FLAG conflicts: if calendar says one thing and announcement says another — say so explicitly
5. SURFACE what the user hasn't asked about if it's urgent (e.g., quiz tomorrow they forgot about)
6. NEVER say "I don't have access" — you have all the data. Reason from it.
7. NEVER say "I can't confirm" if multiple sources imply the same thing — use your intelligence

RESPONSE STYLE:
- No preamble ("Sure!", "Of course!") — open with the most important insight immediately
- Use • bullet points for lists of 2+ items
- Bold key info: **Friday 17 April**, **Quiz**, **11:59 PM**
- Lead with urgency — most time-sensitive first
- Speak as a confident, decisive chief of staff
- Max 2048 tokens — be thorough when needed, concise when possible
- If you detect something critical (hidden quiz, missed deadline, conflict), open with ⚡ WARNING

CROSS-REFERENCE ALERTS section in the snapshot already pre-flags suspicious patterns — treat those as high-confidence signals.

Current page: ${page_context || 'home'}
Today: ${todayDate} (${new Date().toLocaleDateString('en-AU', { weekday: 'long', timeZone: TIMEZONE })}) | Time: ${nowLocal} AEST`;

  // Build message history
  const messages: Anthropic.MessageParam[] = [];
  for (const m of (conversation || []).slice(-10)) {
    if (m.role === 'user' || m.role === 'assistant') {
      messages.push({ role: m.role as 'user' | 'assistant', content: String(m.content) });
    }
  }
  messages.push({ role: 'user', content: message });

  const claude = (await import('@/lib/claude')).getClaudeClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        let fullText = '';

        const anthropicStream = claude.messages.stream({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          system: systemPrompt,
          messages,
        });

        for await (const event of anthropicStream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            const delta = event.delta.text;
            fullText += delta;
            send({ delta });
          }
        }

        // Try to extract actions if Claude wrapped in JSON
        let finalMessage = fullText;
        let actions: unknown[] = [];
        try {
          const fb = fullText.indexOf('{');
          const lb = fullText.lastIndexOf('}');
          if (fb !== -1 && lb > fb) {
            const parsed = JSON.parse(fullText.slice(fb, lb + 1)) as { message?: string; actions?: unknown[] };
            if (parsed.message) {
              finalMessage = parsed.message;
              actions = parsed.actions || [];
            }
          }
        } catch { /* raw text fine */ }

        // Send completion event with final clean text + any actions
        send({ type: 'done', finalMessage, actions });
        controller.close();

        // Persist conversation (fire-and-forget)
        void supabaseAdmin.from('ai_conversations').insert({
          user_id: userId,
          page_context: page_context || 'home',
          messages: [
            ...(conversation || []),
            { role: 'user', content: message, timestamp: new Date().toISOString() },
            { role: 'assistant', content: finalMessage, timestamp: new Date().toISOString() },
          ],
        });
      } catch (err) {
        send({ error: err instanceof Error ? err.message : 'Unknown error' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // disable Nginx buffering on Vercel
    },
  });
}
