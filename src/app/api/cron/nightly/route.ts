import { NextResponse } from 'next/server';
import { getAllUsers, getUserTokens, logError, getUserContext } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase';
import { getCalendarService, getGmailService } from '@/lib/google';
import { generateWithClaude, isAiAvailable } from '@/lib/claude';
import { fetchAllCanvasData } from '@/lib/canvas';
import { buildContextText, storeContextSnapshot } from '@/lib/context-builder';
import { syncCalendarToCache, renewExpiringWatches } from '@/lib/gcal-sync';
import { syncCanvasToCache } from '@/lib/canvas-sync';

const TIMEZONE = 'Australia/Melbourne';
const CRON_SECRET = process.env.CRON_SECRET;

function getTomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

function getTodayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

// Verify cron secret (Vercel sends this header)
function verifyCron(req: Request): boolean {
  if (!CRON_SECRET) return true; // allow if not configured (dev)
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${CRON_SECRET}`;
}

export async function GET(req: Request) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const users = await getAllUsers();
  const results: { user: string; steps: Record<string, string> }[] = [];

  for (const user of users) {
    const steps: Record<string, string> = {};

    try {
      const tokens = await getUserTokens(user.id);
      if (!tokens) {
        steps.auth = 'skipped — no tokens';
        results.push({ user: user.email, steps });
        continue;
      }

      // 1. Refresh calendar cache
      try {
        const calendar = await getCalendarService(user.id);
        const now = new Date();
        const start = new Date(now); start.setHours(0, 0, 0, 0);
        const end = new Date(start); end.setDate(end.getDate() + 8);

        const res = await calendar.events.list({
          calendarId: 'primary',
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
          timeZone: TIMEZONE,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 100,
        });

        const events = (res.data.items || []).map((e) => ({
          id: e.id, title: e.summary || 'Untitled',
          description: e.description || '', location: e.location || '',
          start: e.start?.dateTime || e.start?.date || '',
          end: e.end?.dateTime || e.end?.date || '',
          allDay: !e.start?.dateTime, color: e.colorId || null, status: e.status,
        }));

        await supabaseAdmin.from('calendar_cache').upsert({
          user_id: user.id, data: events, fetched_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        steps.calendar = `ok — ${events.length} events`;
      } catch (e) {
        steps.calendar = `error — ${e instanceof Error ? e.message : 'unknown'}`;
      }

      // 2. Refresh email cache
      try {
        const gmail = await getGmailService(user.id);
        const oneDayAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
        const listRes = await gmail.users.messages.list({ userId: 'me', q: `after:${oneDayAgo}`, maxResults: 20 });
        const messages = listRes.data.messages || [];
        const emails: { id: string; from: string; subject: string; snippet: string; date: string }[] = [];

        for (const msg of messages.slice(0, 15)) {
          try {
            const detail = await gmail.users.messages.get({
              userId: 'me', id: msg.id!, format: 'metadata',
              metadataHeaders: ['From', 'Subject', 'Date'],
            });
            const headers = detail.data.payload?.headers || [];
            const get = (n: string) => headers.find((h) => h.name?.toLowerCase() === n)?.value || '';
            emails.push({ id: msg.id!, from: get('from'), subject: get('subject'), snippet: detail.data.snippet || '', date: get('date') });
          } catch { /* skip individual email errors */ }
        }

        await supabaseAdmin.from('email_cache').upsert({
          user_id: user.id, data: emails, fetched_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        steps.emails = `ok — ${emails.length} emails`;
      } catch (e) {
        steps.emails = `error — ${e instanceof Error ? e.message : 'unknown'}`;
      }

      // 3. Refresh Canvas cache
      try {
        const { data: conn } = await supabaseAdmin
          .from('core_connections')
          .select('enabled')
          .eq('user_id', user.id)
          .eq('service', 'canvas')
          .single();

        if (conn?.enabled) {
          const canvasData = await fetchAllCanvasData(user.id);
          await supabaseAdmin.from('canvas_cache').upsert({
            user_id: user.id, data: canvasData, fetched_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
          steps.canvas = 'ok';
        } else {
          steps.canvas = 'skipped — not connected';
        }
      } catch (e) {
        steps.canvas = `error — ${e instanceof Error ? e.message : 'unknown'}`;
      }

      // 4. Generate tomorrow's schedule (AI)
      if (isAiAvailable()) {
        try {
          const todo = await generateTomorrow(user.id);
          const tomorrow = getTomorrowDate();
          await supabaseAdmin.from('todos').upsert({
            user_id: user.id, date: tomorrow, todo, created_at: new Date().toISOString(),
          }, { onConflict: 'user_id,date' });
          steps.tomorrow = 'ok';
        } catch (e) {
          steps.tomorrow = `error — ${e instanceof Error ? e.message : 'unknown'}`;
        }

        // 5. Generate briefing
        try {
          const briefing = await generateBriefing(user.id);
          const today = getTodayDate();
          await supabaseAdmin.from('briefings').upsert({
            user_id: user.id, date: today, briefing, created_at: new Date().toISOString(),
          }, { onConflict: 'user_id,date' });
          steps.briefing = 'ok';
        } catch (e) {
          steps.briefing = `error — ${e instanceof Error ? e.message : 'unknown'}`;
        }

        // 6. Pre-build daily context snapshot for tomorrow (AI chat reads this for instant responses)
        try {
          const tomorrow = getTomorrowDate();
          const contextText = await buildContextText(user.id, tomorrow);
          await storeContextSnapshot(user.id, tomorrow, contextText);
          steps.context_snapshot = 'ok';
        } catch (e) {
          steps.context_snapshot = `error — ${e instanceof Error ? e.message : 'unknown'}`;
        }
      } else {
        steps.ai = 'skipped — AI unavailable';
      }

      // ── Step: Refresh calendar + canvas mirror caches ─────────────────────
      try {
        await syncCalendarToCache(user.id);
        steps.cal_mirror = 'ok';
      } catch (e) {
        steps.cal_mirror = `error — ${e instanceof Error ? e.message : 'unknown'}`;
      }

      try {
        await syncCanvasToCache(user.id);
        steps.canvas_mirror = 'ok';
      } catch (e) {
        steps.canvas_mirror = `error — ${e instanceof Error ? e.message : 'unknown'}`;
      }

    } catch (e) {
      steps.fatal = e instanceof Error ? e.message : 'unknown';
      await logError('cron/nightly', steps.fatal, user.id);
    }

    results.push({ user: user.email, steps });
  }

  // ── Renew any Google Calendar webhook channels expiring in the next 24h ──
  try {
    await renewExpiringWatches();
  } catch { /* non-fatal */ }

  return NextResponse.json({
    ok: true,
    ran_at: new Date().toISOString(),
    users_processed: results.length,
    results,
  });
}

// --- Generation helpers (duplicated from briefing/tomorrow routes to avoid auth wrapper) ---

async function generateTomorrow(userId: string) {
  const userContext = await getUserContext(userId);

  const [calRes, canvasRes, emailRes, semRes, completionsRes, todosRes, promptRes, settingsRes] = await Promise.all([
    supabaseAdmin.from('calendar_cache').select('data').eq('user_id', userId).single(),
    supabaseAdmin.from('canvas_cache').select('data').eq('user_id', userId).single(),
    supabaseAdmin.from('email_cache').select('data').eq('user_id', userId).single(),
    supabaseAdmin.from('semester_context').select('data').eq('user_id', userId).single(),
    supabaseAdmin.from('task_completions').select('task_id').eq('user_id', userId).gte('completed_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()),
    supabaseAdmin.from('todos').select('todo').eq('user_id', userId).eq('date', getTodayDate()).single(),
    supabaseAdmin.from('card_prompts').select('prompt_text').eq('user_id', userId).eq('card_key', 'tomorrow').single(),
    supabaseAdmin.from('user_settings').select('domains, gym_days').eq('user_id', userId).single(),
  ]);

  const events = calRes.data?.data || [];
  const canvas = canvasRes.data?.data || null;
  const emails = (emailRes.data?.data || []).filter((e: { priority?: string }) => e.priority === 'HIGH');
  const semester = semRes.data?.data || null;
  const completedIds = (completionsRes.data || []).map((c: { task_id: string }) => c.task_id);
  const todayTodo = todosRes.data?.todo || null;
  const customPrompt = promptRes.data?.prompt_text || '';
  const gymDays: string[] = settingsRes.data?.gym_days || [];

  // Days gym wasn't logged recently (for nudge generation)
  const daysSinceGym = (() => {
    const gymCompletions = (completionsRes.data || []).filter((c: { task_id: string }) => c.task_id.includes('gym'));
    return gymCompletions.length === 0 ? 3 : 0; // rough approximation
  })();

  // Upcoming deadlines within 5 days (for nudge generation)
  const urgentDeadlines = canvas?.assignments?.filter((a: { due_at: string | null; name: string }) => {
    if (!a.due_at) return false;
    const days = Math.ceil((new Date(a.due_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days >= 0 && days <= 5;
  }) || [];

  const systemPrompt = `${userContext}

${customPrompt || ''}

COMMANDER SCHEDULING RULES:
1. Morning (6am–12pm): Deep work only — RMIT study, coding, writing. These are protected focus blocks.
2. Afternoon (12pm–6pm): Medium tasks — reviews, emails, lighter study, admin.
3. Evening (6pm–10pm): Gym, personal, wind-down.
4. Group similar tasks into 90-minute focus blocks. Add 15-min buffer between blocks.
5. Never schedule over fixed calendar events (classes, meetings, tutorials).
6. Weight deadline urgency: days_until_due × domain_weight. Lower score = higher priority.
7. If over-scheduled, push lowest-priority tasks and explain why.

Return ONLY valid JSON (no markdown):
{
  "timeline": [
    {
      "id": "unique-id",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "task_name": "Task name",
      "description": "Why this task, why now",
      "estimated_minutes": 90,
      "buffer_minutes": 15,
      "urgency": "red|amber|green|class|gym|work|break",
      "domain": "academia|dev|finance|gym|personal",
      "related_assignment": "assignment name or null",
      "carried_over": false
    }
  ],
  "top_priorities": ["Priority 1 reason", "Priority 2 reason", "Priority 3 reason"],
  "nudges": [
    {
      "type": "deadline|gym|habit|warning",
      "message": "Commander-style proactive message",
      "action_url": "/calendar"
    }
  ],
  "warnings": ["Warning if over-scheduled or conflicts exist"],
  "pushed": [{ "task_name": "...", "reason": "..." }],
  "summary": "One-line day overview"
}`;

  const dataMsg = `Generate the commander schedule for ${getTomorrowDate()}.

CALENDAR (next 7 days): ${JSON.stringify(events)}
${canvas ? `CANVAS DEADLINES (sorted by urgency): ${JSON.stringify(
  canvas.assignments
    ?.filter((a: { due_at: string | null }) => a.due_at)
    .map((a: { name: string; course_name: string; due_at: string }) => ({
      name: a.name, course: a.course_name, due_at: a.due_at,
      days_until_due: Math.ceil((new Date(a.due_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    }))
    .sort((a: { days_until_due: number }, b: { days_until_due: number }) => a.days_until_due - b.days_until_due)
    .slice(0, 12)
)}` : ''}
${emails.length ? `HIGH-PRIORITY EMAILS: ${JSON.stringify(emails.slice(0, 5))}` : ''}
${semester ? `SEMESTER CONTEXT: ${JSON.stringify(semester)}` : ''}
${completedIds.length ? `RECENTLY COMPLETED TASK IDs: ${completedIds.join(', ')}` : ''}
${todayTodo ? `TODAY'S PLAN (carry forward incomplete non-fixed tasks): ${JSON.stringify(todayTodo)}` : ''}
${urgentDeadlines.length ? `⚠️ URGENT DEADLINES (≤5 days): ${JSON.stringify(urgentDeadlines.map((a: { name: string; due_at: string }) => ({ name: a.name, due_at: a.due_at })))}` : ''}
${daysSinceGym >= 3 ? `⚠️ GYM ALERT: No gym logged in ${daysSinceGym}+ days. Gym days setting: ${gymDays.join(', ')}.` : ''}`;

  const response = await generateWithClaude(systemPrompt, dataMsg, { maxTokens: 4096 });
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
  try {
    return JSON.parse(jsonMatch[1]?.trim() || response.trim());
  } catch {
    return { timeline: [], pushed: [], top_priorities: [], nudges: [], warnings: [], summary: response.slice(0, 200), raw: response };
  }
}

async function generateBriefing(userId: string) {
  const userContext = await getUserContext(userId);

  const [calRes, emailRes, canvasRes, semRes, promptRes] = await Promise.all([
    supabaseAdmin.from('calendar_cache').select('data').eq('user_id', userId).single(),
    supabaseAdmin.from('email_cache').select('data').eq('user_id', userId).single(),
    supabaseAdmin.from('canvas_cache').select('data').eq('user_id', userId).single(),
    supabaseAdmin.from('semester_context').select('data').eq('user_id', userId).single(),
    supabaseAdmin.from('card_prompts').select('prompt_text').eq('user_id', userId).eq('card_key', 'weekly').single(),
  ]);

  const events = calRes.data?.data || [];
  const emails = emailRes.data?.data || [];
  const canvas = canvasRes.data?.data || null;
  const semester = semRes.data?.data || null;
  const customPrompt = promptRes.data?.prompt_text || 'Generate a rolling 7-day briefing.';

  const systemPrompt = `${userContext}\n\n${customPrompt}\n\nReturn valid JSON:
{
  "summary": "...",
  "days": [{ "date": "YYYY-MM-DD", "day_label": "Day, DD Mon", "highlights": [], "events": [], "deadlines": [], "priority_actions": [] }],
  "week_priorities": []
}`;

  const dataMsg = `CALENDAR: ${JSON.stringify(events)}
EMAILS: ${JSON.stringify(emails.slice(0, 10))}
${canvas ? `CANVAS: ${JSON.stringify({ assignments: canvas.assignments?.slice(0, 15), announcements: canvas.announcements?.slice(0, 8) })}` : ''}
${semester ? `SEMESTER: ${JSON.stringify(semester)}` : ''}
Today: ${getTodayDate()}`;

  const response = await generateWithClaude(systemPrompt, dataMsg, { maxTokens: 4096 });
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
  try {
    return JSON.parse(jsonMatch[1]?.trim() || response.trim());
  } catch {
    return { summary: response.slice(0, 200), days: [], week_priorities: [], raw: response };
  }
}
