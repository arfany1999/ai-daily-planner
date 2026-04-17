import { supabaseAdmin } from './supabase';

const TIMEZONE = 'Australia/Melbourne';
const NON_TASKS = ['class', 'gym', 'work', 'break'];

type CalEvent = { id?: string; title?: string; summary?: string; start?: string | { dateTime?: string; date?: string }; end?: string | { dateTime?: string; date?: string }; description?: string; location?: string };
type Assignment = { name: string; course_name: string; due_at: string | null; has_submitted_submissions: boolean; description?: string; points_possible?: number };
type Announcement = { title: string; course_name: string; message?: string; posted_at?: string };
type Email = { from?: string; subject?: string; snippet?: string; date?: string };
type TItem = { id: string; time?: string; label?: string; urgency?: string; estimated_minutes?: number; task_name?: string };
type Progress = { completion_rate?: number; tasks_completed?: number; tasks_planned?: number; streak?: number };
type Grade = { course: string; assessment: string; grade: number; max_grade: number; weight: number };

// ── Extract hidden dates and events from free text ─────────────────────────
function extractDatesFromText(text: string): string[] {
  const clean = text.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  const patterns = [
    /\b(quiz|test|exam|assessment|submission|due|deadline|assignment)\b[^.!?\n]{0,80}/gi,
    /\b(week \d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b[^.!?\n]{0,60}/gi,
    /\b\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?\b/g,
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2}/gi,
    /\b\d{1,2} (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/gi,
  ];
  const found: string[] = [];
  for (const p of patterns) {
    const matches = clean.match(p);
    if (matches) found.push(...matches.map((m) => m.trim()).filter((m) => m.length > 3));
  }
  return [...new Set(found)].slice(0, 8);
}

// ── Clean HTML from announcement body ─────────────────────────────────────
function cleanHtml(html: string, maxLen = 600): string {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export type ContextScope = 'full' | 'brief';

/**
 * Build a compact context — ~30% the size of `full` — for fast/cheap
 * agent or chat calls that only need today + next 7 days + urgent deadlines.
 */
export async function buildBriefContext(userId: string, targetDate: string): Promise<string> {
  const [calRes, canvasRes, todoRes] = await Promise.all([
    supabaseAdmin.from('calendar_cache').select('data').eq('user_id', userId).single(),
    supabaseAdmin.from('canvas_cache').select('data').eq('user_id', userId).single(),
    supabaseAdmin.from('todos').select('todo').eq('user_id', userId).eq('date', targetDate).single(),
  ]);

  const lines: string[] = [`=== BRIEF CONTEXT — ${targetDate} ===\n`];
  const events: CalEvent[] = (calRes.data?.data as CalEvent[] | null) || [];
  const from = new Date(targetDate + 'T00:00:00');
  const to = new Date(from); to.setDate(to.getDate() + 7);
  const upcoming = events
    .filter(e => {
      const raw = typeof e.start === 'string' ? e.start : (e.start?.dateTime || e.start?.date || '');
      const d = new Date(raw); return d >= from && d <= to;
    })
    .sort((a, b) => {
      const ar = typeof a.start === 'string' ? a.start : (a.start?.dateTime || a.start?.date || '');
      const br = typeof b.start === 'string' ? b.start : (b.start?.dateTime || b.start?.date || '');
      return new Date(ar).getTime() - new Date(br).getTime();
    })
    .slice(0, 15);

  lines.push('📅 NEXT 7 DAYS:');
  if (!upcoming.length) lines.push('  (nothing)');
  for (const e of upcoming) {
    const raw = typeof e.start === 'string' ? e.start : (e.start?.dateTime || e.start?.date || '');
    const dt = new Date(raw);
    const day = dt.toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TIMEZONE });
    const hasTime = typeof e.start === 'object' && e.start?.dateTime;
    const time = hasTime ? dt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TIMEZONE }) : 'all-day';
    lines.push(`  ${day} ${time} — ${e.title || e.summary || 'Untitled'}`);
  }

  const canvas = canvasRes.data?.data as { assignments?: Assignment[] } | null;
  const urgentDeadlines = (canvas?.assignments || [])
    .filter(a => !a.has_submitted_submissions && a.due_at)
    .map(a => ({ ...a, days: Math.ceil((new Date(a.due_at!).getTime() - Date.now()) / 86400000) }))
    .filter(a => a.days >= 0 && a.days <= 14)
    .sort((a, b) => a.days - b.days)
    .slice(0, 8);

  lines.push('\n📚 UPCOMING DEADLINES (≤14 days):');
  if (!urgentDeadlines.length) lines.push('  (none)');
  for (const d of urgentDeadlines) {
    lines.push(`  ${d.course_name} — ${d.name} — due in ${d.days}d`);
  }

  const today = todoRes.data?.todo as { timeline?: TItem[] } | null;
  if (today?.timeline?.length) {
    lines.push("\n📋 TODAY'S PLAN:");
    for (const t of today.timeline.slice(0, 12)) {
      lines.push(`  ${t.time || '—'} ${t.task_name || t.label || 'task'}`);
    }
  }

  return lines.join('\n');
}

export async function buildContextText(userId: string, targetDate: string, scope: ContextScope = 'full'): Promise<string> {
  if (scope === 'brief') return buildBriefContext(userId, targetDate);

  const [calRes, canvasRes, emailRes, todoRes, completionsRes, gradesRes, progressRes, semRes] = await Promise.all([
    supabaseAdmin.from('calendar_cache').select('data').eq('user_id', userId).single(),
    supabaseAdmin.from('canvas_cache').select('data').eq('user_id', userId).single(),
    supabaseAdmin.from('email_cache').select('data').eq('user_id', userId).single(),
    supabaseAdmin.from('todos').select('todo').eq('user_id', userId).eq('date', targetDate).single(),
    supabaseAdmin.from('task_completions').select('task_id').eq('user_id', userId).eq('date', targetDate).not('task_id', 'like', 'pushed_%'),
    supabaseAdmin.from('user_settings').select('grades').eq('user_id', userId).single(),
    supabaseAdmin.from('progress_weekly').select('data').eq('user_id', userId).order('week_start', { ascending: false }).limit(1).single(),
    supabaseAdmin.from('semester_context').select('data').eq('user_id', userId).single(),
  ]);

  // Run intelligence engine first
  let intelligenceSummary = '';
  try {
    const { runIntelligenceEngine } = await import('./intelligence-engine');
    const report = await runIntelligenceEngine(userId, targetDate);
    intelligenceSummary = report.rawSummary + '\n\n';
  } catch { /* non-fatal, fall back to raw data only */ }

  const lines: string[] = [intelligenceSummary + `=== INTELLIGENCE SNAPSHOT — ${targetDate} ===\n`];

  // ── 1. Calendar — full 14 days with descriptions ──────────────────────────
  const events: CalEvent[] = (calRes.data?.data as CalEvent[] | null) || [];
  const from = new Date(targetDate + 'T00:00:00');
  const to = new Date(from); to.setDate(to.getDate() + 14);

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

  lines.push('📅 CALENDAR (next 14 days):');
  if (upcoming.length === 0) {
    lines.push('  No upcoming events.');
  } else {
    upcoming.forEach((e) => {
      const raw = typeof e.start === 'string' ? e.start : (e.start?.dateTime || e.start?.date || '');
      const dt = new Date(raw);
      const isToday = dt.toLocaleDateString('en-CA', { timeZone: TIMEZONE }) === targetDate;
      const dayStr = isToday
        ? 'TODAY'
        : dt.toLocaleDateString('en-AU', { weekday: 'long', month: 'short', day: 'numeric', timeZone: TIMEZONE });
      const hasTime = typeof e.start === 'object' && e.start?.dateTime;
      const timeStr = hasTime
        ? dt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TIMEZONE })
        : 'all-day';
      const endRaw = typeof e.end === 'string' ? e.end : (e.end?.dateTime || e.end?.date || '');
      const endDt = endRaw ? new Date(endRaw) : null;
      const endStr = endDt && hasTime
        ? '–' + endDt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TIMEZONE })
        : '';
      const loc = e.location ? ` @ ${e.location}` : '';
      const desc = e.description ? ` [${e.description.slice(0, 80)}]` : '';
      lines.push(`  ${dayStr} ${timeStr}${endStr} — ${e.title || e.summary || 'Untitled'}${loc}${desc}`);
    });
  }
  lines.push('');

  // ── 2. Canvas assignments — ALL unsubmitted, full detail ──────────────────
  const canvas = canvasRes.data?.data as {
    assignments?: Assignment[];
    announcements?: Announcement[];
    courses?: { name: string; id: number }[];
  } | null;

  const allDeadlines = (canvas?.assignments || [])
    .filter((a) => !a.has_submitted_submissions && a.due_at)
    .map((a) => ({ ...a, days: Math.ceil((new Date(a.due_at!).getTime() - Date.now()) / 86400000) }))
    .sort((a, b) => a.days - b.days);

  lines.push('📚 CANVAS ASSIGNMENTS (all unsubmitted):');
  if (allDeadlines.length === 0) {
    lines.push('  No pending assignments found.');
  } else {
    allDeadlines.slice(0, 20).forEach((a) => {
      const badge = a.days < 0
        ? `⚠️ OVERDUE ${Math.abs(a.days)}d`
        : a.days === 0 ? '🔴 DUE TODAY'
        : a.days === 1 ? '🟠 TOMORROW'
        : a.days <= 3 ? `🟡 in ${a.days}d`
        : `in ${a.days}d`;
      const pts = a.points_possible ? ` (${a.points_possible}pts)` : '';
      lines.push(`  [${badge}] ${a.name}${pts} — ${a.course_name}`);
    });
  }
  lines.push('');

  // ── 3. Canvas announcements — FULL text, date-extracted ──────────────────
  const announcements = (canvas?.announcements || []).slice(0, 10);
  if (announcements.length > 0) {
    lines.push('📣 CANVAS ANNOUNCEMENTS (full content):');
    announcements.forEach((a) => {
      const body = cleanHtml(a.message || '', 600);
      const posted = a.posted_at
        ? new Date(a.posted_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TIMEZONE })
        : '';
      lines.push(`\n  ▸ [${a.course_name}] "${a.title}"${posted ? ` (${posted})` : ''}:`);
      if (body) lines.push(`    ${body.split('\n').join('\n    ')}`);

      // Extract implicit dates/events from the announcement body
      const extracted = extractDatesFromText(a.message || '');
      if (extracted.length > 0) {
        lines.push(`    ⚠️ KEY MENTIONS: ${extracted.join(' | ')}`);
      }
    });
    lines.push('');
  }

  // ── 4. Emails — full subject + snippet ────────────────────────────────────
  const emails: Email[] = (emailRes.data?.data as Email[] | null) || [];
  if (emails.length > 0) {
    lines.push('📧 RECENT EMAILS:');
    emails.slice(0, 15).forEach((e, i) => {
      const sender = (e.from || '').replace(/<[^>]+>/, '').trim() || 'Unknown';
      const snippet = cleanHtml(e.snippet || '', 200);
      const dateStr = e.date
        ? new Date(e.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TIMEZONE })
        : '';
      lines.push(`  ${i + 1}. [${dateStr}] ${sender}`);
      lines.push(`     Subject: "${e.subject || '(no subject)'}"`);
      if (snippet) lines.push(`     Preview: ${snippet}`);
    });
    lines.push('');
  }

  // ── 5. Semester context ───────────────────────────────────────────────────
  const sem = semRes.data?.data as { week?: number; semester?: string; key_dates?: string[] } | null;
  if (sem) {
    lines.push('🗓️ SEMESTER CONTEXT:');
    if (sem.week) lines.push(`  Current week: Week ${sem.week}`);
    if (sem.semester) lines.push(`  Semester: ${sem.semester}`);
    if (sem.key_dates?.length) lines.push(`  Key dates: ${sem.key_dates.join(', ')}`);
    lines.push('');
  }

  // ── 6. Cross-reference intelligence alerts ────────────────────────────────
  const alerts: string[] = [];

  // Find announcement-mentioned events not on calendar
  const calTitles = upcoming.map((e) => (e.title || e.summary || '').toLowerCase());
  for (const ann of announcements) {
    const body = cleanHtml(ann.message || '', 1000).toLowerCase();
    const keywords = ['quiz', 'test', 'exam', 'lab test', 'practical exam', 'mid-semester', 'midsem'];
    for (const kw of keywords) {
      if (body.includes(kw) && !calTitles.some((t) => t.includes(kw))) {
        alerts.push(`[${ann.course_name}] Announcement mentions "${kw}" — NOT found in calendar. Check if this needs to be scheduled.`);
        break;
      }
    }
  }

  // Find overdue/imminent assignments that have NO calendar block
  const urgentAssignments = allDeadlines.filter((a) => a.days >= 0 && a.days <= 3);
  for (const a of urgentAssignments) {
    const nameWords = a.name.toLowerCase().split(' ').filter((w) => w.length > 4);
    const hasCal = calTitles.some((t) => nameWords.some((w) => t.includes(w)));
    if (!hasCal) {
      alerts.push(`[${a.course_name}] "${a.name}" due in ${a.days}d — no calendar block found. Consider scheduling study time.`);
    }
  }

  // Find emails referencing deadlines
  for (const e of emails.slice(0, 8)) {
    const sub = (e.subject || '').toLowerCase();
    const snip = (e.snippet || '').toLowerCase();
    const combined = sub + ' ' + snip;
    if (/due|deadline|quiz|exam|urgent|reminder|submission/.test(combined)) {
      alerts.push(`Email from ${(e.from || '').split('<')[0].trim()}: "${e.subject}" — may contain deadline/action item.`);
    }
  }

  if (alerts.length > 0) {
    lines.push('🚨 CROSS-REFERENCE ALERTS (potential hidden events / conflicts):');
    alerts.forEach((a) => lines.push(`  ⚡ ${a}`));
    lines.push('');
  }

  // ── 7. Today's plan ───────────────────────────────────────────────────────
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
      lines.push(`    ☐ ${t.time || '--:--'} ${t.task_name || t.label || '(unlabelled)'} [${t.urgency || '?'}]${mins}`);
    });
  }
  if (doneTasks.length > 0) {
    lines.push('  DONE:');
    doneTasks.forEach((t) => lines.push(`    ✓ ${t.time || ''} ${t.task_name || t.label || ''}`));
  }
  if (fixedItems.length > 0) {
    lines.push('  FIXED: ' + fixedItems.map((t) => `${t.time || ''} ${t.task_name || t.label || t.urgency}`).join(' | '));
  }
  if (actionTasks.length === 0) lines.push('  No plan generated for today yet.');
  lines.push('');

  // ── 8. Grades ─────────────────────────────────────────────────────────────
  const progress = progressRes.data?.data as Progress | null;
  const grades: Grade[] = (gradesRes.data?.grades as Grade[] | null) || [];

  if (grades.length > 0 || progress) {
    lines.push('📊 GRADES & PROGRESS:');
    if (progress) {
      lines.push(`  This week: ${progress.completion_rate ?? 0}% (${progress.tasks_completed ?? 0}/${progress.tasks_planned ?? 0} tasks)${(progress.streak ?? 0) > 0 ? ` | Streak: ${progress.streak}d 🔥` : ''}`);
    }
    if (grades.length > 0) {
      const totalW = grades.reduce((s, g) => s + g.weight, 0);
      const wAvg = totalW > 0 ? grades.reduce((s, g) => s + (g.grade / g.max_grade) * g.weight, 0) / totalW * 100 : 0;
      const band = wAvg >= 85 ? 'HD' : wAvg >= 75 ? 'D' : wAvg >= 65 ? 'C' : wAvg >= 50 ? 'P' : 'F';
      grades.forEach((g) => {
        const pct = Math.round((g.grade / g.max_grade) * 100);
        lines.push(`  ${g.course}: ${g.assessment} = ${g.grade}/${g.max_grade} (${pct}%)`);
      });
      lines.push(`  Weighted average: ${wAvg.toFixed(1)}% — ${band}`);
    }
    lines.push('');
  }

  lines.push('=== END SNAPSHOT ===');
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
