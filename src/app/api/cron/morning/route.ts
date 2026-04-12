import { NextResponse } from 'next/server';
import { getAllUsers, getUserTokens, logError } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase';
import { getCalendarService } from '@/lib/google';
import { sendPushToUser } from '@/lib/push';

const TIMEZONE = 'Australia/Melbourne';
const CRON_SECRET = process.env.CRON_SECRET;

function getTodayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

function verifyCron(req: Request): boolean {
  if (!CRON_SECRET) return true;
  return req.headers.get('authorization') === `Bearer ${CRON_SECRET}`;
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
      if (!tokens) { steps.auth = 'skipped'; results.push({ user: user.email, steps }); continue; }

      // 1. Quick calendar refresh (get today's events)
      let todayEvents: { title: string; start: string; end: string }[] = [];
      try {
        const calendar = await getCalendarService(user.id);
        const now = new Date();
        const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);

        const res = await calendar.events.list({
          calendarId: 'primary',
          timeMin: todayStart.toISOString(), timeMax: todayEnd.toISOString(),
          timeZone: TIMEZONE, singleEvents: true, orderBy: 'startTime', maxResults: 20,
        });

        todayEvents = (res.data.items || []).map((e) => ({
          title: e.summary || 'Untitled',
          start: e.start?.dateTime || e.start?.date || '',
          end: e.end?.dateTime || e.end?.date || '',
        }));
        steps.calendar = `ok — ${todayEvents.length} today`;
      } catch (e) {
        steps.calendar = `error — ${e instanceof Error ? e.message : 'unknown'}`;
      }

      // 2. Load today's commander plan (generated last night)
      const today = getTodayDate();
      const { data: todayPlan } = await supabaseAdmin
        .from('todos')
        .select('todo')
        .eq('user_id', user.id)
        .eq('date', today)
        .single();

      const plan = todayPlan?.todo;
      const firstName = user.name?.split(' ')[0] || 'there';

      // 3. Build commander push notification
      let title = `Good morning, ${firstName}`;
      let body = '';
      let url = '/home';

      if (plan) {
        // Use top nudge if available
        const nudges: { type: string; message: string; action_url?: string }[] = plan.nudges || [];
        const topNudge = nudges.find(n => n.type === 'deadline') || nudges[0];

        const topPriorities: string[] = plan.top_priorities || [];
        const eventCount = todayEvents.length;
        const timelineCount = (plan.timeline || []).filter(
          (t: { urgency: string }) => !['break'].includes(t.urgency)
        ).length;

        if (topNudge) {
          // Commander nudge — specific and actionable
          body = topNudge.message;
          url = topNudge.action_url || '/home';
        } else if (topPriorities.length > 0) {
          body = `Today: ${topPriorities[0]}${topPriorities[1] ? ` · ${topPriorities[1]}` : ''}`;
        } else {
          const warnings: string[] = plan.warnings || [];
          const isOverScheduled = warnings.length > 0;
          body = `${timelineCount} blocks planned · ${eventCount} calendar event${eventCount !== 1 ? 's' : ''}`;
          if (isOverScheduled) body += ' · ⚠️ Day is tight';
          if (plan.summary) body = plan.summary;
        }
      } else {
        // Fallback: no plan generated yet
        const eventCount = todayEvents.length;
        const { data: canvasCache } = await supabaseAdmin
          .from('canvas_cache').select('data').eq('user_id', user.id).single();
        const urgentDeadlines = (canvasCache?.data?.assignments || []).filter((a: { due_at: string | null }) => {
          if (!a.due_at) return false;
          const daysUntil = Math.ceil((new Date(a.due_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          return daysUntil >= 0 && daysUntil <= 2;
        });

        body = `${eventCount} event${eventCount !== 1 ? 's' : ''} today.`;
        if (urgentDeadlines.length > 0) {
          body += ` ${urgentDeadlines.length} deadline${urgentDeadlines.length !== 1 ? 's' : ''} in 48hrs!`;
        }
      }

      try {
        await sendPushToUser(user.id, { title, body, tag: 'morning-briefing', url });
        steps.push = 'sent';
      } catch {
        steps.push = 'no subscription';
      }

    } catch (e) {
      steps.fatal = e instanceof Error ? e.message : 'unknown';
      await logError('cron/morning', steps.fatal, user.id);
    }

    results.push({ user: user.email, steps });
  }

  return NextResponse.json({ ok: true, ran_at: new Date().toISOString(), results });
}
