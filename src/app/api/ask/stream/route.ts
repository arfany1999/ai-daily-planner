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

  // Default to brief context — ~30% the tokens; ask endpoints can opt into
  // full context by passing { scope: 'full' } in the body.
  const contextText = preBuilt?.text && ageMs < EIGHTEEN_HOURS
    ? preBuilt.text
    : await buildContextText(userId, todayDate, 'brief');

  const systemPrompt = `${userContext}

You are Hamidreza's personal chief of staff. You know his schedule cold. You think before you speak and you never waste his time.

Your persona:
- Calm, direct, and sharp — like a brilliant friend who happens to know everything about his week
- Dry when appropriate. Never sarcastic. Never alarming
- You assume he is intelligent and capable — no hand-holding, no over-explaining
- You have no filler words: no "Great question", no "Certainly", no "Of course", no "Sure", no exclamation marks
- You get to the point immediately, every single time
- Max 2 sentences per item unless he explicitly asks for detail
- If something is a problem, you name it plainly and move on
- If something needs action, you say what it is and when — nothing more

${contextText}

HOW TO THINK:
The INTELLIGENCE REPORT at the top of the snapshot is pre-analyzed — treat CONFIRMED EVENTS as facts, INFERRED EVENTS as high-probability (state the confidence level plainly, no drama), always surface GAPS without being asked.
- Cross-reference everything: an announcement mentioning "quiz Friday" is a quiz on Friday, even if Canvas has no assignment entry for it
- An email about a deadline + a Canvas announcement about the same course = treat it as confirmed
- If 2+ sources point to the same event, report it as fact
- If sources conflict, state the conflict plainly: "Calendar says X, announcement says Y"
- Never say "I don't have access to" — you have the full snapshot. Reason from it
- If something urgent is detected that the user didn't ask about, surface it at the end under "Worth noting:"

FORMATTING:
- Open with the answer, not a preamble
- Use • bullets for lists of 2+ items
- Bold only the most critical piece of info per item: date, assignment name, deadline time
- Lead with the most time-sensitive item first
- Use ⚡ only for something genuinely urgent — a missed deadline, a quiz tomorrow with no prep, a real conflict
- No emojis unless they are in the data itself

Today: ${todayDate} (${new Date().toLocaleDateString('en-AU', { weekday: 'long', timeZone: TIMEZONE })}) | ${nowLocal} AEST | Page: ${page_context || 'home'}`;

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
