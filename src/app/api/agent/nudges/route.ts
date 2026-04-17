import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendPushToUser } from '@/lib/push';

const TZ = 'Australia/Melbourne';

interface Nudge { kind: string; message: string; domain?: string; url?: string; }

function melbDate(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

/**
 * Proactive nudge engine — detects *absence* patterns, not just upcoming events.
 * Called by cron (e.g. every 3h). Sends web push when a nudge fires.
 *
 * Current rules:
 *   - no gym log in >= 3 days → health nudge (6pm window only)
 *   - no dev commit/deploy task in >= 3 days → dev nudge
 *   - Canvas deadline within 48h with no study block → academia urgent
 *   - over-scheduled day (> 10 blocks) → warning
 */
export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && req.headers.get('x-vercel-cron') !== '1') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: users } = await supabaseAdmin
    .from('user_settings')
    .select('user_id, push_enabled, timezone');

  const results: { userId: string; nudges: Nudge[] }[] = [];

  for (const u of users || []) {
    if (!u.push_enabled) continue;

    const userId: string = u.user_id;
    const today = melbDate(0);
    const nudges: Nudge[] = [];

    // Fetch last 14 days of todos for history
    const { data: recent } = await supabaseAdmin
      .from('todos')
      .select('date, todo')
      .eq('user_id', userId)
      .gte('date', melbDate(-14))
      .lte('date', today);

    const hasDomainRecent = (dom: string, withinDays: number) => {
      const cutoff = melbDate(-withinDays);
      return (recent || []).some(r => {
        if (r.date < cutoff) return false;
        const tl = ((r.todo as { timeline?: { domain?: string; task_name?: string; urgency?: string }[] }).timeline) || [];
        return tl.some(b => b.domain === dom || (dom === 'health' && b.urgency === 'gym') || (dom === 'dev' && b.urgency === 'work'));
      });
    };

    // 1) Gym absence
    const nowHour = parseInt(new Date().toLocaleString('en-AU', { timeZone: TZ, hour: 'numeric', hour12: false }), 10);
    if (!hasDomainRecent('health', 3) && nowHour >= 16 && nowHour <= 20) {
      nudges.push({
        kind: 'gym-absent',
        domain: 'health',
        message: "Gym hasn't been scheduled in 3 days — carve out 6–7pm tonight?",
        url: '/home',
      });
    }

    // 2) Dev absence
    if (!hasDomainRecent('dev', 3)) {
      nudges.push({
        kind: 'dev-absent',
        domain: 'dev',
        message: "No dev work in 3 days — 90 min after lunch tomorrow?",
        url: '/calendar',
      });
    }

    // 3) Canvas deadlines inside 48h
    const { data: canvas } = await supabaseAdmin
      .from('canvas_cache')
      .select('data')
      .eq('user_id', userId)
      .single();
    if (canvas?.data) {
      const assignments = (canvas.data as { assignments?: { name: string; course_name: string; due_at: string | null; has_submitted_submissions?: boolean }[] }).assignments || [];
      const inTwoDays = Date.now() + 48 * 3600 * 1000;
      for (const a of assignments) {
        if (!a.due_at || a.has_submitted_submissions) continue;
        const t = new Date(a.due_at).getTime();
        if (t > Date.now() && t < inTwoDays) {
          nudges.push({
            kind: 'deadline-close',
            domain: 'academia',
            message: `${a.name} due in ${Math.round((t - Date.now()) / 3600000)}h — block study time?`,
            url: '/home',
          });
          break; // one per run
        }
      }
    }

    // 4) Over-scheduled today
    const todayPlan = (recent || []).find(r => r.date === today);
    if (todayPlan) {
      const count = ((todayPlan.todo as { timeline?: unknown[] }).timeline || []).length;
      if (count > 10) {
        nudges.push({
          kind: 'overbooked',
          message: `Today is packed (${count} blocks). Want me to trim the lowest-priority ones?`,
          url: '/home',
        });
      }
    }

    // Dedup against previously-sent (24h)
    const { data: sent } = await supabaseAdmin
      .from('nudge_log')
      .select('kind, sent_at')
      .eq('user_id', userId)
      .gte('sent_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());
    const sentKinds = new Set((sent || []).map(s => s.kind));
    const fresh = nudges.filter(n => !sentKinds.has(n.kind));

    for (const n of fresh) {
      try {
        await sendPushToUser(userId, {
          title: '◈ Commander',
          body: n.message,
          tag: n.kind,
          url: n.url,
        });
        await supabaseAdmin.from('nudge_log').insert({
          user_id: userId,
          kind: n.kind,
          sent_at: new Date().toISOString(),
          payload: n as unknown as Record<string, unknown>,
        });
      } catch {
        // continue
      }
    }

    if (fresh.length) results.push({ userId, nudges: fresh });
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}

export const GET = POST; // for testing via browser with auth bearer
