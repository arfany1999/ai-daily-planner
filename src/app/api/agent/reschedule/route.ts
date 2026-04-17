import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';
import { generateWithClaude } from '@/lib/claude';

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

const SYSTEM = `You are the Commander reschedule engine. Given the user's request and their current day plan, propose a minimal set of changes.

Return STRICT JSON:
{
  "summary": "one-line human summary e.g. 'Move gym to 7pm, shift AT3 to 3pm'",
  "proposal": "multi-line diff, each line starts with + (added) or - (removed) or ~ (moved). Example:\n- 14:00 Gym\n+ 19:00 Gym\n~ AT3 14:00 → 15:00",
  "reason": "brief disruption-cost explanation (1 sentence)",
  "changes": [
    { "op": "move", "id": "...", "new_start": "HH:MM", "new_end": "HH:MM" },
    { "op": "add", "task_name": "...", "start": "HH:MM", "end": "HH:MM", "domain": "..." },
    { "op": "remove", "id": "..." }
  ]
}

Constraints:
- Do NOT touch work hours (red-flag) or existing calendar events unless explicitly asked
- Respect user's energy curve: mornings = deep work, evenings = gym/light
- Minimize cascading changes. One move = one reschedule, not a full rebuild.`;

export const POST = withAuth(async (req, userId) => {
  const cmd = await req.json() as Cmd;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const targetDate = cmd.date || today;

  const { data: existing } = await supabaseAdmin
    .from('todos').select('todo').eq('user_id', userId).eq('date', targetDate).single();

  const plan = (existing?.todo as { timeline?: { id: string; task_name: string; start_time: string; end_time: string; urgency?: string }[] }) || { timeline: [] };
  const timeline = plan.timeline || [];

  const userMsg = `User said: "${cmd.raw || cmd.title || ''}"
Parsed intent: ${cmd.intent} | target: ${cmd.title || '—'} | new time: ${cmd.start_time || '—'} | domain: ${cmd.domain || '—'}

Current plan for ${targetDate}:
${timeline.length === 0 ? '(empty — no blocks yet)' : timeline.map(t => `- ${t.start_time}–${t.end_time} ${t.task_name} [${t.urgency}]`).join('\n')}

Propose the minimal reschedule. Return JSON only.`;

  try {
    const raw = await generateWithClaude(SYSTEM, userMsg, {
      model: 'claude-sonnet-4-20250514',
      maxTokens: 1200,
    });
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const proposal = JSON.parse(cleaned);
    return NextResponse.json(proposal);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'engine-failed';
    // Minimal fallback proposal
    return NextResponse.json({
      summary: `Propose: ${cmd.raw || cmd.title || 'change'}`,
      proposal: '~ (unable to compute a precise diff — AI engine offline)',
      reason: `Engine failed: ${msg}`,
      changes: [],
    });
  }
});
