import { supabaseAdmin } from './supabase';

const TIMEZONE = 'Australia/Melbourne';
const NON_TASKS = ['class', 'gym', 'work', 'break'];

type CalEvent = { title?: string; summary?: string; start?: string | { dateTime?: string; date?: string } };
type Assignment = { name: string; course_name: string; due_at: string | null; has_submitted_submissions: boolean };
type Announcement = { title: string; course_name: string; message?: string };
type Email = { from?: string; subject?: string; snippet?: string };
type TItem = { id: string; time?: string; label?: string; urgency?: string; estimated_minutes?: number };
type Progress = { completion_rate?: number; tasks_completed?: number; tasks_planned?: number; streak?: number };
type Grade = { course: string; assessment: string; grade: number; max_grade: number; weight: number };

export async function buildContextText(userId: string, targetDate: string): Promise<string> {
  const [calRes, canvasRes, emailRes, todoRes, completionsRes, gradesRes, progressRes] = await Promise.all([
    supabaseAdmin.from('calendar_cache').select('data').eq('user_id', userId).single(),
    supabaseAdmin.from('canvas_cache').select('data').eq('user_id', userId).single(),
    supabaseAdmin.from('email_cache').select('data').eq('user_id', userId).single(),
    supabaseAdmin.from('todos').select('todo').eq('user_id', userId).eq('date', targetDate).single(),
    supabaseAdmin.from('task_completions').select('task_id').eq('user_id', userId).eq('date', targetDate).not('task_id', 'like', 'pushed_%'),
    supabaseAdmin.from('user_settings').select('grades').eq('user_id', userId).single(),
    supabaseAdmin.from('progress_weekly').select('data').eq('user_id', userId).order('week_start', { ascending: false }).limit(1).single(),
  ]);

  const lines: string[] = [`=== LIVE DATA SNAPSHOT — ${targetDate} ===\n`];

  // ── Calendar ──────────────────────────────────────────────────────────────
  const events: CalEvent[] = (calRes.data?.data as CalEvent[] | null) || [];
  const from = new Date(targetDate + 'T00:00:00');
  const to = new Date(from); to.setDate(to.getDate() + 7);

  const upcoming = events
    .filter((e) => {
      const raw = typeof e.start === 'string' ? e.start : (e.start?.dateTime || e.start?.date || '');
      const d = new Date(raw);
      return d >= from && d <= to;
    })
    .sort((a, b) => {
      const ar = typeof a.start === 'string' ? a.start : (a.start?.dateTime || a.start?.date || '');
      const br = typeof b.start === 'string' ? b.start : (b.start?.dateTime || b.start?.date || '');
      return new Date(ar).getTime() - new Date(br).getTime();
    });

  lines.push('📅 CALENDAR (next 7 days):');
  if (upcoming.length === 0) {
    lines.push('  No upcoming events.');
  } else {
    upcoming.forEach((e) => {
      const raw = typeof e.start === 'string' ? e.start : (e.start?.dateTime || e.start?.date || '');
      const dt = new Date(raw);
      const isToday = dt.toLocaleDateString('en-CA', { timeZone: TIMEZONE }) === targetDate;
      const dayStr = isToday
        ? 'TODAY'
        : dt.toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TIMEZONE });
      const hasTime = typeof e.start === 'object' && e.start?.dateTime;
      const timeStr = hasTime
        ? dt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TIMEZONE })
        : 'all-day';
      lines.push(`  ${dayStr} ${timeStr} — ${e.title || e.summary || 'Untitled'}`);
    });
  }
  lines.push('');

  // ── Canvas deadlines ──────────────────────────────────────────────────────
  const canvas = canvasRes.data?.data as { assignments?: Assignment[]; announcements?: Announcement[] } | null;

  const deadlines = (canvas?.assignments || [])
    .filter((a) => !a.has_submitted_submissions && a.due_at)
    .map((a) => ({ ...a, days: Math.ceil((new Date(a.due_at!).getTime() - Date.now()) / 86400000) }))
    .filter((a) => a.days <= 30)
    .sort((a, b) => a.days - b.days);

  lines.push('📚 CANVAS DEADLINES (next 30 days):');
  if (deadlines.length === 0) {
    lines.push('  No upcoming unsubmitted assignments.');
  } else {
    deadlines.forEach((a) => {
      const badge = a.days < 0
        ? `OVERDUE(${Math.abs(a.days)}d ago)`
        : a.days === 0 ? 'DUE TODAY'
        : a.days === 1 ? 'TOMORROW'
        : `in ${a.days}d`;
      lines.push(`  [${badge}] ${a.name} — ${a.course_name}`);
    });
  }
  lines.push('');

  // ── Canvas announcements ──────────────────────────────────────────────────
  const announcements = (canvas?.announcements || []).slice(0, 5);
  if (announcements.length > 0) {
    lines.push('📣 CANVAS ANNOUNCEMENTS:');
    announcements.forEach((a) => {
      const body = (a.message || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 150);
      lines.push(`  [${a.course_name}] ${a.title}${body ? ': ' + body : ''}`);
    });
    lines.push('');
  }

  // ── Emails ────────────────────────────────────────────────────────────────
  const emails: Email[] = (emailRes.data?.data as Email[] | null) || [];
  if (emails.length > 0) {
    lines.push('📧 RECENT EMAILS:');
    emails.slice(0, 10).forEach((e, i) => {
      const sender = (e.from || '').split('<')[0].trim() || 'Unknown';
      const snippet = (e.snippet || '').slice(0, 100);
      lines.push(`  ${i + 1}. ${sender}: "${e.subject || '(no subject)'}" — ${snippet}`);
    });
    lines.push('');
  }

  // ── Today's plan ──────────────────────────────────────────────────────────
  const timeline: TItem[] = ((todoRes.data?.todo as { timeline?: TItem[] })?.timeline || []);
  const completedIds = new Set((completionsRes.data || []).map((c) => c.task_id));
  const actionTasks = timeline.filter((t) => !NON_TASKS.includes(t.urgency || ''));
  const fixedItems = timeline.filter((t) => NON_TASKS.includes(t.urgency || ''));
  const doneTasks = actionTasks.filter((t) => completedIds.has(t.id));
  const pendingTasks = actionTasks.filter((t) => !completedIds.has(t.id));

  lines.push(`✅ TODAY'S PLAN — ${targetDate} (${doneTasks.length}/${actionTasks.length} tasks done):`);
  if (pendingTasks.length > 0) {
    lines.push('  PENDING:');
    pendingTasks.forEach((t) => {
      const mins = t.estimated_minutes ? ` ~${t.estimated_minutes}min` : '';
      lines.push(`    ☐ ${t.time || '--:--'} ${t.label || '(unlabelled)'} [${t.urgency || '?'}]${mins}`);
    });
  }
  if (doneTasks.length > 0) {
    lines.push('  DONE:');
    doneTasks.forEach((t) => lines.push(`    ✓ ${t.time || ''} ${t.label || ''}`));
  }
  if (fixedItems.length > 0) {
    lines.push('  FIXED: ' + fixedItems.map((t) => `${t.time || ''} ${t.label || t.urgency}`).join(' | '));
  }
  if (actionTasks.length === 0) lines.push('  No plan generated for today yet.');
  lines.push('');

  // ── Progress & grades ─────────────────────────────────────────────────────
  const progress = progressRes.data?.data as Progress | null;
  const grades: Grade[] = (gradesRes.data?.grades as Grade[] | null) || [];

  lines.push('📊 PROGRESS & GRADES:');
  if (progress) {
    lines.push(`  This week: ${progress.completion_rate ?? 0}% (${progress.tasks_completed ?? 0}/${progress.tasks_planned ?? 0} tasks)`);
    if ((progress.streak ?? 0) > 0) lines.push(`  Streak: ${progress.streak} days 🔥`);
  }
  if (grades.length > 0) {
    const totalW = grades.reduce((s, g) => s + g.weight, 0);
    const wAvg = totalW > 0 ? grades.reduce((s, g) => s + (g.grade / g.max_grade) * g.weight, 0) / totalW * 100 : 0;
    const band = wAvg >= 85 ? 'HD' : wAvg >= 75 ? 'D' : wAvg >= 65 ? 'C' : wAvg >= 50 ? 'P' : 'F';
    grades.forEach((g) => {
      const pct = Math.round((g.grade / g.max_grade) * 100);
      lines.push(`  ${g.course.replace(/\s*\(\d+\)\s*$/, '')}: ${g.assessment} = ${g.grade}/${g.max_grade} (${pct}%)`);
    });
    lines.push(`  → Weighted average: ${wAvg.toFixed(1)}% — ${band}`);
  } else {
    lines.push('  No grades recorded yet.');
  }

  lines.push('\n=== END SNAPSHOT ===');
  return lines.join('\n');
}

// Store context snapshot in briefings table (merges with existing row)
export async function storeContextSnapshot(userId: string, targetDate: string, contextText: string): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('briefings').select('briefing').eq('user_id', userId).eq('date', targetDate).single();

  const merged = {
    ...(existing?.briefing as object || {}),
    daily_context: {
      generated_at: new Date().toISOString(),
      target_date: targetDate,
      text: contextText,
    },
  };

  await supabaseAdmin.from('briefings').upsert({
    user_id: userId,
    date: targetDate,
    briefing: merged,
    created_at: new Date().toISOString(),
  }, { onConflict: 'user_id,date' });
}
