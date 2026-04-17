import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { generateWithClaude } from '@/lib/claude';

const TZ = 'Australia/Melbourne';

function melbDateStr(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

const SYSTEM = `You are the Commander intent parser. Classify the user's text into a structured command.

Return STRICT JSON (no prose, no markdown fences) matching:
{
  "intent": "schedule" | "reschedule" | "search" | "ask" | "jump" | "focus" | "delete" | "complete" | "unknown",
  "title": string | null,
  "date": "YYYY-MM-DD" | null,
  "start_time": "HH:MM" (24h) | null,
  "end_time": "HH:MM" | null,
  "duration_min": number | null,
  "domain": "academia" | "dev" | "finance" | "health" | "admin" | "break" | null,
  "query": string | null,
  "route": "/home" | "/calendar" | "/tomorrow" | "/focus" | "/canvas" | "/progress" | "/settings" | null,
  "reasoning": string,
  "confidence": number between 0 and 1
}

Rules:
- "Plan my tomorrow" / "what should I do" → ask
- "Schedule X at Y" / "block X for Z min" → schedule
- "Move X to Y" / "reschedule X" / "swap today for light blocks" → reschedule
- "Find X" / "search X" → search (put search term in query)
- "Go to calendar" / "open tomorrow" → jump (fill route)
- "Start focus on X" / "pomodoro" → focus
- "Mark X done" / "completed X" → complete
- "Delete X" / "cancel X" → delete

Domain guesses:
- gym / workout / run / meals / sleep → health
- lecture / class / canvas / rmit / study / assignment / exam / quiz / biol / onps → academia
- deploy / code / vercel / github / mrgren / pr / api / build → dev
- crypto / btc / eth / dca / portfolio → finance
- lunch / break / rest → break
- else → admin

Time parsing hints (Melbourne timezone):
- "tomorrow" → date offset +1
- "Friday", "next Monday" → compute the next weekday
- "2pm" → 14:00, "9am" → 09:00
- Duration "90 min" / "1.5h" → duration_min: 90
- Only set start_time if explicit time given
- Never invent a date if user said none → keep null`;

export const POST = withAuth(async (req) => {
  const { text, page } = await req.json() as { text: string; page?: string };
  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'Missing text' }, { status: 400 });
  }

  const today = melbDateStr(0);
  const tomorrow = melbDateStr(1);
  const weekday = new Date().toLocaleDateString('en-AU', { timeZone: TZ, weekday: 'long' });

  const userMsg = `Current context:
- Today: ${today} (${weekday})
- Tomorrow: ${tomorrow}
- Timezone: Melbourne/AEST
- User is on: ${page || '/home'}

User said: "${text}"

Return JSON only.`;

  try {
    const raw = await generateWithClaude(SYSTEM, userMsg, {
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 400,
      cacheSystem: true,
    });
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const parsed = JSON.parse(cleaned);
    return NextResponse.json({ ...parsed, raw: text });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'parse-failed';
    // Fallback heuristic — no LLM
    const lower = text.toLowerCase();
    const fallback = {
      intent: lower.startsWith('go to') || lower.startsWith('open') ? 'jump'
        : /^(search|find)\b/.test(lower) ? 'search'
        : /\b(move|reschedule|swap|shift)\b/.test(lower) ? 'reschedule'
        : /\b(schedule|block|add|create)\b/.test(lower) ? 'schedule'
        : 'ask',
      title: null,
      date: null, start_time: null, end_time: null, duration_min: null,
      domain: null, query: text, route: null,
      reasoning: `Fallback (LLM parse failed: ${msg})`,
      confidence: 0.3,
      raw: text,
    };
    return NextResponse.json(fallback);
  }
});
