'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { T, BUILTIN_CARDS } from '@/lib/theme';
import AddConnectionModal from '@/components/AddConnectionModal';
import OnboardingTour from '@/components/OnboardingTour';
import SearchModal from '@/components/SearchModal';
import PomodoroWidget from '@/components/PomodoroWidget';

interface TimelineBlock {
  id: string;
  start_time: string;
  end_time: string;
  task_name: string;
  urgency: string;
  domain?: string;
  description?: string;
  recurring?: boolean;
  subtasks?: string[];
}

interface Nudge {
  type: string;
  message: string;
  action_url?: string;
}

interface TodayPlan {
  timeline: TimelineBlock[];
  top_priorities: string[];
  nudges: Nudge[];
  warnings: string[];
  pushed: { task_name: string; reason: string }[];
  summary: string;
}

interface CalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  color: string | null;
}

interface BriefingDay {
  date: string;
  day_label: string;
  highlights: string[];
  deadlines: string[];
  priority_actions: string[];
}

interface Briefing {
  summary: string;
  days: BriefingDay[];
  week_priorities: string[];
}

const URGENCY_COLORS: Record<string, string> = {
  red: '#e94f4f', amber: '#f5a623', green: '#27c77a',
  class: '#4a6ef5', gym: '#27c77a', work: '#0d9b8a', break: '#a0998066',
};

const URGENCY_LABELS: Record<string, string> = {
  red: 'Urgent', amber: 'Priority', green: 'Task',
  class: 'Class', gym: 'Gym', work: 'Work', break: 'Break',
};

const NON_TASK_URGENCIES = ['class', 'gym', 'work', 'break'];
const isTask = (b: TimelineBlock) => !NON_TASK_URGENCIES.includes(b.urgency);

function melbHourNow(): number {
  return parseInt(new Date().toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', hour: 'numeric', hour12: false }), 10);
}

function isBlockNow(block: TimelineBlock): boolean {
  const now = melbHourNow();
  const startH = parseInt(block.start_time.split(':')[0], 10);
  const endH = parseInt(block.end_time.split(':')[0], 10);
  return now >= startH && now < endH;
}

function isBlockPast(block: TimelineBlock): boolean {
  const now = melbHourNow();
  const endH = parseInt(block.end_time.split(':')[0], 10);
  return now >= endH;
}

function parseTags(name: string): { cleanName: string; tags: string[] } {
  const tags: string[] = [];
  const cleanName = name.replace(/#(\w+)/g, (_, tag) => { tags.push(tag); return ''; }).trim();
  return { cleanName, tags };
}

const TAG_COLORS = ['#4a6ef5', '#e94f4f', '#27c77a', '#f5a623', '#a855f7', '#0d9b8a'];

const GCAL_COLORS: Record<string, string> = {
  '1':'#7986CB','2':'#33B679','3':'#8E24AA','4':'#E67C73',
  '5':'#F6BF26','6':'#F4511E','7':'#039BE5','8':'#757575',
  '9':'#3F51B5','10':'#0B8043','11':'#D50000',
};

function calToBlock(ev: CalEvent): TimelineBlock & { _fromCal?: boolean } {
  const fmtHM = (iso: string) => {
    if (!iso.includes('T')) return '00:00';
    const d = new Date(iso);
    return d.toLocaleTimeString('en-AU', { timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit', hour12: false });
  };
  const t = ev.title.toLowerCase();
  const urgency = t.includes('gym') || t.includes('workout') ? 'gym'
    : t.includes('work') && !t.includes('homework') ? 'work'
    : t.includes('lecture') || t.includes('tut') || t.includes('class') || t.includes('lab') || t.includes('practical') ? 'class'
    : t.includes('lunch') || t.includes('dinner') || t.includes('breakfast') || t.includes('meal') ? 'break'
    : 'class';
  return {
    id: `gcal-${ev.id}`,
    start_time: ev.allDay ? '00:00' : fmtHM(ev.start),
    end_time: ev.allDay ? '23:59' : fmtHM(ev.end),
    task_name: ev.title,
    description: '',
    urgency,
    domain: 'calendar',
    _fromCal: true,
  };
}

/** Merge calendar events into the AI timeline, avoiding duplicates */
function mergeTimeline(aiBlocks: TimelineBlock[], calEvents: CalEvent[]): TimelineBlock[] {
  const merged = [...aiBlocks];
  for (const ev of calEvents) {
    // Skip if AI plan already has a similar item at the same time
    const calBlock = calToBlock(ev);
    const isDuplicate = aiBlocks.some(b => {
      const sameTime = b.start_time === calBlock.start_time;
      const similarName = b.task_name.toLowerCase().includes(ev.title.toLowerCase().slice(0, 10))
        || ev.title.toLowerCase().includes(b.task_name.toLowerCase().slice(0, 10));
      return sameTime && similarName;
    });
    if (!isDuplicate) merged.push(calBlock);
  }
  return merged.sort((a, b) => a.start_time.localeCompare(b.start_time));
}
function tagColor(tag: string): string {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) & 0xffffffff;
  return TAG_COLORS[Math.abs(h) % TAG_COLORS.length];
}

export default function HomePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [conns, setConns] = useState({ google: true, gmail: true, canvas: false });
  const [health, setHealth] = useState<Record<string, { status: string }> | null>(null);
  const [ready, setReady] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [todayPlan, setTodayPlan] = useState<TodayPlan | null>(null);
  const [planApproved, setPlanApproved] = useState(false);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [refreshingPlan, setRefreshingPlan] = useState(false);
  const [calEvents, setCalEvents] = useState<CalEvent[]>([]);
  const [doneToday, setDoneToday] = useState<Set<string>>(new Set());
  const [quickAdd, setQuickAdd] = useState('');
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [taskFilter, setTaskFilter] = useState<'all' | 'pending' | 'done' | 'urgent'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'matrix'>('list');
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [subtaskDone, setSubtaskDone] = useState<Record<string, Set<number>>>({});
  const [canvasStats, setCanvasStats] = useState<{ deadlines: number; announcements: number; courses: number } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/settings').then((r) => r.json()).catch(() => ({})),
      fetch('/api/health').then((r) => r.json()).catch(() => ({ checks: {} })),
    ]).then(([settings, healthData]) => {
      if (settings.setup_complete === false) {
        router.push('/setup');
        return;
      }
      setHealth(healthData.checks);
      setConns({
        google: healthData.checks?.google?.status === 'ok',
        gmail: healthData.checks?.google?.status === 'ok',
        canvas: healthData.checks?.canvas?.status === 'ok',
      });
      setReady(true);
    }).catch(() => setReady(true));

    // Load today's plan in background
    fetch('/api/today')
      .then((r) => r.json())
      .then((d) => {
        if (d.plan) setTodayPlan(d.plan as TodayPlan);
      })
      .catch(() => {});

    // Also load today's completions
    fetch('/api/progress')
      .then(r => r.json())
      .then(d => {
        if (d.today_tasks) {
          const ids = d.today_tasks.filter((t: { completed: boolean }) => t.completed).map((t: { id: string }) => t.id);
          setDoneToday(new Set(ids));
        }
      }).catch(() => {});

    // Load today's live Google Calendar events
    fetch('/api/calendar')
      .then((r) => r.json())
      .then((d) => {
        if (d.events) {
          const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
          const todayEvs = (d.events as CalEvent[]).filter(e => {
            if (e.allDay) return e.start.startsWith(todayStr);
            return e.start.startsWith(todayStr) || e.start.includes('T') && e.start.slice(0, 10) === todayStr;
          }).sort((a, b) => a.start.localeCompare(b.start));
          setCalEvents(todayEvs);
        }
      })
      .catch(() => {});

    // Load briefing in background (non-blocking)
    fetch('/api/briefing')
      .then((r) => r.json())
      .then((d) => {
        if (d.briefing) setBriefing(d.briefing as Briefing);
      })
      .catch(() => {});

    // Load canvas stats for card live counts
    fetch('/api/canvas')
      .then((r) => r.json())
      .then((d: { data?: { assignments?: { due_at?: string | null }[]; announcements?: unknown[]; courses?: unknown[] } }) => {
        if (!d.data) return;
        const now = new Date();
        const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const deadlines = (d.data.assignments || []).filter(
          (a) => a.due_at && new Date(a.due_at) > now && new Date(a.due_at) <= sevenDays
        ).length;
        setCanvasStats({
          deadlines,
          announcements: (d.data.announcements || []).length,
          courses: (d.data.courses || []).length,
        });
      })
      .catch(() => {});
  }, [router]);

  const refreshPlan = async () => {
    setRefreshingPlan(true);
    try {
      const r = await fetch('/api/today/refresh', { method: 'POST' });
      const d = await r.json();
      if (d.plan) setTodayPlan(d.plan as TodayPlan);
    } catch { /* keep current */ }
    setRefreshingPlan(false);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const toggleTask = async (taskId: string) => {
    const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
    if (doneToday.has(taskId)) {
      // Uncomplete - DELETE from completions
      setDoneToday(prev => { const n = new Set(prev); n.delete(taskId); return n; });
      await fetch('/api/tasks/uncomplete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: taskId, date: todayDate }) });
    } else {
      setDoneToday(prev => new Set([...prev, taskId]));
      await fetch('/api/tasks/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: taskId, date: todayDate }) });
    }
  };

  const handleQuickAdd = async () => {
    if (!quickAdd.trim()) return;
    setQuickAddLoading(true);
    try {
      const r = await fetch('/api/tasks/quick-add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: quickAdd.trim() }) });
      const d = await r.json();
      if (d.plan) setTodayPlan(d.plan);
      setQuickAdd('');
    } catch { /* ignore */ }
    setQuickAddLoading(false);
  };

  if (!ready) {
    return (
      <div style={{ padding: '60px 18px', textAlign: 'center', color: T.textMuted, fontSize: 13 }}>
        Loading...
      </div>
    );
  }

  const firstName = session?.user?.name?.split(' ')[0] || 'there';
  const melbHour = parseInt(new Date().toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', hour: 'numeric', hour12: false }), 10);
  const greeting = melbHour < 12 ? 'Good morning' : melbHour < 17 ? 'Good afternoon' : 'Good evening';
  const melbTime = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

  // Merge calendar events into AI timeline for unified view
  const mergedBlocks = todayPlan?.timeline
    ? mergeTimeline(todayPlan.timeline, calEvents)
    : [];

  // ── Live card stats ────────────────────────────────────────────────────────
  const cardStats: Record<string, string | null> = {};

  // weekly: briefing today highlights + week priority count
  if (briefing) {
    const hl = briefing.days?.[0]?.highlights?.length ?? 0;
    const wp = briefing.week_priorities?.length ?? 0;
    const dl = briefing.days?.[0]?.deadlines?.length ?? 0;
    cardStats.weekly = dl > 0
      ? `${dl} deadline${dl !== 1 ? 's' : ''} today · ${wp} priorities`
      : hl > 0 ? `${hl} highlight${hl !== 1 ? 's' : ''} today` : wp > 0 ? `${wp} week priorities` : null;
  }

  // tomorrow: pending tasks from today's plan
  if (todayPlan) {
    const allT = mergedBlocks.filter(isTask);
    const pending = allT.filter(t => !doneToday.has(t.id)).length;
    const done = doneToday.size;
    if (allT.length > 0) {
      cardStats.tomorrow = pending === 0
        ? `✓ All ${done} done`
        : `${pending} pending · ${done} done`;
    }
  }

  // canvas + materials: from canvasStats
  if (canvasStats !== null) {
    cardStats.canvas = canvasStats.deadlines > 0
      ? `${canvasStats.deadlines} deadline${canvasStats.deadlines !== 1 ? 's' : ''} this week`
      : `${canvasStats.announcements} announcement${canvasStats.announcements !== 1 ? 's' : ''}`;
    cardStats.materials = canvasStats.courses > 0
      ? `${canvasStats.courses} course${canvasStats.courses !== 1 ? 's' : ''} synced`
      : null;
  }

  // calendar: next event countdown
  if (calEvents.length > 0) {
    const now = new Date();
    const next = calEvents.find(e => !e.allDay && new Date(e.end) > now);
    if (next && !next.allDay) {
      const minsUntil = Math.round((new Date(next.start).getTime() - now.getTime()) / 60000);
      cardStats.calendar = minsUntil > 0
        ? `Next in ${minsUntil < 60 ? `${minsUntil}m` : `${Math.round(minsUntil / 60)}h`} · ${next.title.slice(0, 22)}`
        : `${calEvents.length} event${calEvents.length !== 1 ? 's' : ''} today`;
    } else {
      cardStats.calendar = `${calEvents.length} event${calEvents.length !== 1 ? 's' : ''} today`;
    }
  }

  const isActive = (c: typeof BUILTIN_CARDS[0]) => c.requires.every((r) => conns[r as keyof typeof conns]);
  const active = BUILTIN_CARDS.filter(isActive);
  const inactive = BUILTIN_CARDS.filter((c) => !isActive(c));

  return (
    <div style={{ padding: '22px 16px' }}>
      <OnboardingTour />

      {/* Greeting */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div>
              <div style={{ fontSize: 13, color: T.textMuted, fontWeight: 400, marginBottom: 2 }}>
                {greeting}, {firstName}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: T.text, letterSpacing: '-0.8px' }}>
                What&apos;s the plan?
              </div>
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4, fontWeight: 400 }}>
                {melbTime} · Melbourne
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button onClick={() => setSearchOpen(true)} style={{
                width: 34, height: 34, borderRadius: 10, border: `1px solid ${T.border}`,
                background: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="11" cy="11" r="7" stroke={T.textMuted} strokeWidth="2"/>
                  <path d="M21 21l-4.35-4.35" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
              <img
                src="/icons/icon-source.jpg"
                alt="avatar"
                style={{
                  width: 52, height: 52, borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2.5px solid rgba(255,255,255,0.9)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                  flexShrink: 0,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Calendar-only view when no AI plan exists yet */}
      {!todayPlan && calEvents.length > 0 && (
        <div style={{
          marginBottom: 20,
          background: 'rgba(255,255,255,0.58)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.85)',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 4px 24px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)',
          animation: 'springIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
        }}>
          <div style={{
            padding: '12px 16px 10px',
            borderBottom: '1px solid rgba(0,0,0,0.05)',
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'linear-gradient(135deg, rgba(74,110,245,0.07), rgba(74,110,245,0.03))',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="17" rx="3" stroke={T.teal} strokeWidth="1.8" />
              <path d="M16 2v4M8 2v4M3 9h18" stroke={T.teal} strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>Today from Google Calendar</span>
            <span style={{ marginLeft: 'auto', fontSize: 9, color: T.textMuted, fontWeight: 500 }}>Live · {calEvents.length} event{calEvents.length !== 1 ? 's' : ''}</span>
          </div>
          {calEvents.map(ev => {
            const t = ev.title.toLowerCase();
            const color = t.includes('work') ? '#0d9b8a' : t.includes('gym') ? '#27c77a' : '#4a6ef5';
            const fmtTime = (iso: string) => { if (!iso.includes('T')) return 'All day'; return new Date(iso).toLocaleTimeString('en-AU', { timeZone: 'Australia/Melbourne', hour: 'numeric', minute: '2-digit', hour12: true }); };
            const now = new Date();
            const isNow = !ev.allDay && new Date(ev.start) <= now && new Date(ev.end) > now;
            const isPast = !ev.allDay && new Date(ev.end) < now;
            return (
              <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: '1px solid rgba(0,0,0,0.03)', background: isNow ? `${color}08` : 'transparent', opacity: isPast ? 0.4 : 1 }}>
                <div style={{ width: 3, alignSelf: 'stretch', minHeight: 18, borderRadius: 2, background: color, flexShrink: 0 }} />
                <div style={{ width: 72, flexShrink: 0 }}><div style={{ fontSize: 10, fontWeight: 600, color: isNow ? color : T.textMuted }}>{ev.allDay ? 'All day' : fmtTime(ev.start)}</div>{!ev.allDay && <div style={{ fontSize: 9, color: T.textMuted }}>{fmtTime(ev.end)}</div>}</div>
                <div style={{ flex: 1, fontSize: 12, fontWeight: isNow ? 700 : 500, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isNow && <span style={{ color, marginRight: 5 }}>▶</span>}{ev.title}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Morning Briefing */}
      {briefing && (
        <div style={{
          marginBottom: 20,
          background: 'rgba(255,255,255,0.58)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.85)',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 4px 24px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)',
          animation: 'springIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
        }}>
          {/* Header */}
          <div style={{
            padding: '13px 16px 10px',
            background: 'linear-gradient(135deg, rgba(240,170,80,0.1), rgba(230,120,50,0.06))',
            borderBottom: '1px solid rgba(0,0,0,0.05)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: 8,
              background: 'linear-gradient(135deg, #f0aa50, #e67832)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="4" fill="#fff" />
                <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text, letterSpacing: '-0.2px' }}>Morning Briefing</div>
              {briefing.summary && (
                <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1, lineHeight: 1.4 }}>{briefing.summary}</div>
              )}
            </div>
          </div>

          {/* Today's highlights */}
          {briefing.days?.[0]?.highlights?.length > 0 && (
            <div style={{ padding: '10px 16px 8px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#e67832', marginBottom: 7 }}>
                Today · {briefing.days[0].day_label}
              </div>
              {briefing.days[0].highlights.slice(0, 4).map((h, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 5 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#e67832', flexShrink: 0, marginTop: 4 }} />
                  <div style={{ fontSize: 11, color: T.text, lineHeight: 1.4 }}>{h}</div>
                </div>
              ))}
              {briefing.days[0].deadlines?.length > 0 && briefing.days[0].deadlines.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 5 }}>
                  <div style={{ fontSize: 11, color: '#e94f4f' }}>⏰</div>
                  <div style={{ fontSize: 11, color: '#e94f4f', lineHeight: 1.4, fontWeight: 500 }}>{d}</div>
                </div>
              ))}
            </div>
          )}

          {/* Week priorities */}
          {briefing.week_priorities?.length > 0 && (
            <div style={{ padding: '8px 16px 12px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.textMuted, marginBottom: 6 }}>This Week</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {briefing.week_priorities.slice(0, 3).map((p, i) => (
                  <div key={i} style={{
                    fontSize: 10, fontWeight: 500, padding: '4px 10px', borderRadius: 8,
                    background: 'rgba(240,170,80,0.1)', color: '#c07828',
                    border: '1px solid rgba(240,170,80,0.25)',
                  }}>{p}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Commander: Today's Plan — empty state */}
      {!todayPlan && !refreshingPlan && (
        <div style={{
          marginBottom: 20,
          background: 'rgba(255,255,255,0.45)',
          border: '2px dashed rgba(74,110,245,0.2)',
          borderRadius: 20, padding: '22px 20px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10,
          animation: 'fadeIn 0.3s ease both',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>No plan generated yet</div>
          <div style={{ fontSize: 11, color: T.textMuted, maxWidth: 260, lineHeight: 1.5 }}>
            The nightly cron runs at 9pm to generate your plan. Tap to generate one now.
          </div>
          <button onClick={refreshPlan} style={{
            padding: '9px 20px', borderRadius: 10,
            background: `linear-gradient(135deg,${T.tealDk},${T.teal})`,
            color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>Generate Today&apos;s Plan</button>
        </div>
      )}
      {!todayPlan && refreshingPlan && (
        <div style={{ marginBottom: 20, padding: '22px 20px', textAlign: 'center', color: T.textMuted, fontSize: 12, background: 'rgba(255,255,255,0.45)', borderRadius: 20 }}>
          Generating your plan… this takes ~15 seconds
        </div>
      )}

      {/* Commander: Today's Plan */}
      {todayPlan && (
        <div style={{
          marginBottom: 20,
          background: 'rgba(255,255,255,0.58)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.85)',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 4px 24px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)',
          animation: 'springIn 0.4s cubic-bezier(0.34,1.56,0.64,1) 0.05s both',
        }}>
          {/* Header */}
          <div style={{
            padding: '13px 16px 10px',
            background: 'linear-gradient(135deg, rgba(74,110,245,0.08), rgba(13,155,138,0.06))',
            borderBottom: '1px solid rgba(0,0,0,0.05)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 26, height: 26, borderRadius: 8,
                background: 'linear-gradient(135deg, #4a6ef5, #0d9b8a)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, letterSpacing: '-0.2px' }}>Today&apos;s Plan</div>
                {todayPlan.summary && (
                  <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>{todayPlan.summary}</div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={refreshPlan} disabled={refreshingPlan} title="Regenerate plan with latest data" style={{
                width: 26, height: 26, borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)',
                background: 'rgba(255,255,255,0.6)', color: T.textMuted,
                cursor: refreshingPlan ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: refreshingPlan ? 0.5 : 1,
                fontSize: 13,
              }}>{refreshingPlan ? '…' : '↻'}</button>
              {!planApproved ? (
                <button onClick={() => setPlanApproved(true)} style={{
                  padding: '5px 12px', borderRadius: 8,
                  background: 'linear-gradient(135deg, #4a6ef5, #0d9b8a)',
                  color: '#fff', border: 'none', fontSize: 10, fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '0.04em',
                }}>Approve ✓</button>
              ) : (
                <span style={{ fontSize: 10, color: T.green, fontWeight: 700 }}>✓ Approved</span>
              )}
            </div>
          </div>

          {/* Top 3 priorities */}
          {todayPlan.top_priorities?.length > 0 && (
            <div style={{ padding: '10px 16px 6px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.textMuted, marginBottom: 7 }}>
                Top Priorities
              </div>
              {todayPlan.top_priorities.slice(0, 3).map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 5 }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: 6, flexShrink: 0,
                    background: i === 0 ? '#e94f4f18' : i === 1 ? '#f5a62318' : '#27c77a18',
                    border: `1px solid ${i === 0 ? '#e94f4f30' : i === 1 ? '#f5a62330' : '#27c77a30'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 700,
                    color: i === 0 ? '#e94f4f' : i === 1 ? '#f5a623' : '#27c77a',
                  }}>{i + 1}</div>
                  <div style={{ fontSize: 11, color: T.text, lineHeight: 1.4, flex: 1 }}>{p}</div>
                </div>
              ))}
            </div>
          )}

          {/* Filter tabs + View toggle */}
          {(() => {
            const allTasks = mergedBlocks.filter(b => isTask(b));
            const doneCnt = allTasks.filter(b => doneToday.has(b.id)).length;
            return (
              <div style={{ padding: '8px 16px 6px', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['all', 'pending', 'done', 'urgent'] as const).map(f => (
                    <button key={f} onClick={() => setTaskFilter(f)} style={{
                      padding: '3px 9px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      fontSize: 10, fontWeight: taskFilter === f ? 700 : 500,
                      background: taskFilter === f ? T.teal : 'rgba(0,0,0,0.05)',
                      color: taskFilter === f ? '#fff' : T.textMuted,
                    }}>{f === 'all' ? `All (${allTasks.length})` : f === 'pending' ? `Pending (${allTasks.length - doneCnt})` : f === 'done' ? `Done (${doneCnt})` : 'Urgent'}</button>
                  ))}
                </div>
                <button onClick={() => setViewMode(v => v === 'list' ? 'matrix' : 'list')} style={{
                  padding: '3px 9px', borderRadius: 6, border: `1px solid ${T.border}`, cursor: 'pointer',
                  fontSize: 10, fontWeight: 600, background: viewMode === 'matrix' ? T.tealGlow : 'transparent',
                  color: viewMode === 'matrix' ? T.teal : T.textMuted,
                }}>⊞ Matrix</button>
              </div>
            );
          })()}

          {/* Eisenhower Matrix View */}
          {viewMode === 'matrix' && (() => {
            const tasks = mergedBlocks.filter(b => isTask(b));
            const quadrants = [
              { label: 'Do First', sublabel: 'Urgent + Important', urgencies: ['red'], color: '#e54d4d' },
              { label: 'Schedule', sublabel: 'Not Urgent + Important', urgencies: ['amber', 'green'], color: T.teal },
              { label: 'Delegate', sublabel: 'Urgent + Not Important', urgencies: ['class', 'gym', 'work'], color: '#d4920a' },
              { label: 'Eliminate', sublabel: 'Neither', urgencies: ['break', 'personal'], color: T.textMuted },
            ];
            return (
              <div style={{ padding: '10px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {quadrants.map(q => {
                  const qTasks = tasks.filter(t => q.urgencies.includes(t.urgency));
                  return (
                    <div key={q.label} style={{ background: q.color + '0d', border: `1px solid ${q.color}25`, borderRadius: 10, padding: '8px 10px', minHeight: 80 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: q.color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{q.label}</div>
                      <div style={{ fontSize: 8, color: T.textMuted, marginBottom: 6 }}>{q.sublabel}</div>
                      {qTasks.length === 0 ? <div style={{ fontSize: 10, color: T.textMuted, fontStyle: 'italic' }}>Empty</div> : qTasks.map(t => (
                        <div key={t.id} style={{ fontSize: 10, color: T.text, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: doneToday.has(t.id) ? 'line-through' : 'none', opacity: doneToday.has(t.id) ? 0.5 : 1 }}>• {t.task_name}</div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Timeline — all blocks, past ones dimmed */}
          {viewMode === 'list' && mergedBlocks.slice(0, 25).filter(block => {
            if (!isTask(block)) return true; // always show fixed events
            if (taskFilter === 'pending') return !doneToday.has(block.id);
            if (taskFilter === 'done') return doneToday.has(block.id);
            if (taskFilter === 'urgent') return block.urgency === 'red';
            return true;
          }).map((block) => {
            const color = URGENCY_COLORS[block.urgency] || T.teal;
            const isNow = isBlockNow(block);
            const isPast = isBlockPast(block);
            const isBreak = block.urgency === 'break';
            const label = URGENCY_LABELS[block.urgency] || block.domain || '';
            const isDone = doneToday.has(block.id);
            return (
              <div key={block.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: isBreak ? '5px 16px' : '8px 16px',
                background: isNow ? `${color}09` : 'transparent',
                borderBottom: '1px solid rgba(0,0,0,0.03)',
                opacity: isPast ? 0.4 : 1,
                transition: 'opacity 0.2s',
              }}>
                <div style={{ width: 3, alignSelf: 'stretch', minHeight: 16, borderRadius: 2, background: isBreak ? 'rgba(0,0,0,0.12)' : color, flexShrink: 0 }} />
                {isTask(block) && (
                  <div onClick={() => toggleTask(block.id)} style={{
                    width: 18, height: 18, borderRadius: 5, border: `2px solid ${isDone ? color : T.border}`,
                    background: isDone ? color : 'transparent', flexShrink: 0, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
                  }}>
                    {isDone && <svg width="10" height="10" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>}
                  </div>
                )}
                <div style={{ width: 68, flexShrink: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: isNow ? color : T.textMuted }}>
                    {block.start_time}
                  </div>
                  {!isBreak && <div style={{ fontSize: 9, color: T.textMuted }}>{block.end_time}</div>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {(() => { const { cleanName, tags } = parseTags(block.task_name); return (<>
                  <div style={{ fontSize: isBreak ? 10 : 11, fontWeight: isNow ? 700 : 500, color: isBreak ? T.textMuted : T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: isDone ? 'line-through' : 'none' }}>
                    {isNow && <span style={{ color, marginRight: 5 }}>▶</span>}
                    {cleanName}
                    {(block as TimelineBlock & { _fromCal?: boolean })._fromCal && <span title="From Google Calendar" style={{ marginLeft: 5, fontSize: 9, color: T.textMuted, opacity: 0.6 }}>📅</span>}
                    {block.recurring && <span title="Recurring" style={{ marginLeft: 5, fontSize: 10, color: T.textMuted, opacity: 0.7 }}>↻</span>}
                  </div>
                  {tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                      {tags.map(tag => {
                        const tc = tagColor(tag);
                        return (
                          <span key={tag} style={{ fontSize: 8, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: tc + '18', color: tc, border: `1px solid ${tc}30`, letterSpacing: '0.04em' }}>#{tag}</span>
                        );
                      })}
                    </div>
                  )}
                  </>); })()}
                  {block.description && !isBreak && !isPast && (
                    <div style={{ fontSize: 9, color: T.textMuted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{block.description}</div>
                  )}
                  {/* Subtasks expand */}
                  {block.subtasks && block.subtasks.length > 0 && expandedTasks.has(block.id) && (
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {block.subtasks.map((sub, si) => {
                        const isDoneSub = subtaskDone[block.id]?.has(si) ?? false;
                        return (
                          <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div onClick={() => setSubtaskDone(prev => {
                              const cur = new Set(prev[block.id] || []);
                              if (cur.has(si)) cur.delete(si); else cur.add(si);
                              return { ...prev, [block.id]: cur };
                            })} style={{
                              width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${isDoneSub ? color : T.border}`,
                              background: isDoneSub ? color : 'transparent', cursor: 'pointer', flexShrink: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {isDoneSub && <svg width="8" height="8" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>}
                            </div>
                            <span style={{ fontSize: 10, color: T.textSoft, textDecoration: isDoneSub ? 'line-through' : 'none', opacity: isDoneSub ? 0.5 : 1 }}>{sub}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {label && !isBreak && (
                  <div style={{
                    fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                    padding: '2px 6px', borderRadius: 4,
                    background: `${color}14`, color,
                    flexShrink: 0,
                  }}>{label}</div>
                )}
                {block.subtasks && block.subtasks.length > 0 && (
                  <button onClick={() => setExpandedTasks(prev => {
                    const n = new Set(prev);
                    if (n.has(block.id)) n.delete(block.id); else n.add(block.id);
                    return n;
                  })} title="Subtasks" style={{
                    width: 22, height: 22, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.06)',
                    cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, color: T.textMuted, fontWeight: 700,
                  }}>{expandedTasks.has(block.id) ? '▾' : '▸'} {block.subtasks.length}</button>
                )}
                {isTask(block) && !isBreak && (
                  <button onClick={() => (window as any).__startPomodoro?.(block.task_name)} title="Start Pomodoro" style={{
                    width: 22, height: 22, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.06)',
                    cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11,
                  }}>🍅</button>
                )}
              </div>
            );
          })}

          {/* Warnings */}
          {todayPlan.warnings?.length > 0 && (
            <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(0,0,0,0.04)' }}>
              {todayPlan.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 10, color: '#f5a623', display: 'flex', gap: 5, alignItems: 'flex-start' }}>
                  <span>⚠️</span><span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Nudges */}
          {todayPlan.nudges?.length > 0 && (
            <div style={{ padding: '8px 16px 12px', display: 'flex', flexWrap: 'wrap', gap: 6, borderTop: '1px solid rgba(0,0,0,0.04)' }}>
              {todayPlan.nudges.slice(0, 3).map((n, i) => (
                <Link key={i} href={n.action_url || '/home'} style={{ textDecoration: 'none' }}>
                  <div style={{
                    padding: '5px 10px', borderRadius: 8, fontSize: 10, fontWeight: 500,
                    background: n.type === 'deadline' ? '#e94f4f10' : n.type === 'gym' ? '#27c77a10' : 'rgba(74,110,245,0.08)',
                    color: n.type === 'deadline' ? '#e94f4f' : n.type === 'gym' ? '#27c77a' : '#4a6ef5',
                    border: `1px solid ${n.type === 'deadline' ? '#e94f4f25' : n.type === 'gym' ? '#27c77a25' : 'rgba(74,110,245,0.15)'}`,
                    cursor: 'pointer',
                  }}>
                    {n.type === 'deadline' ? '⏰' : n.type === 'gym' ? '🏋️' : '💡'} {n.message}
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Quick Add */}
          <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(0,0,0,0.05)', display: 'flex', gap: 8 }}>
            <input
              value={quickAdd}
              onChange={e => setQuickAdd(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleQuickAdd()}
              placeholder="+ Add a task…"
              style={{
                flex: 1, border: 'none', background: 'rgba(0,0,0,0.04)', borderRadius: 8,
                padding: '7px 12px', fontSize: 12, color: T.text, outline: 'none',
              }}
            />
            <button onClick={handleQuickAdd} disabled={quickAddLoading || !quickAdd.trim()} style={{
              padding: '7px 14px', borderRadius: 8, border: 'none',
              background: T.teal, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              opacity: quickAdd.trim() ? 1 : 0.5,
            }}>Add</button>
          </div>
        </div>
      )}

      {/* Health indicators */}
      {health && (
        <div style={{ display: 'flex', gap: 7, marginBottom: 20, flexWrap: 'wrap' }}>
          {Object.entries(health).map(([key, val]) => (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 11px', borderRadius: 20,
              background: 'rgba(255,255,255,0.52)',
              border: `1px solid rgba(255,255,255,0.8)`,
              backdropFilter: 'blur(8px)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: val.status === 'ok' ? T.green : val.status === 'error' ? T.red : T.yellow,
                boxShadow: `0 0 6px ${val.status === 'ok' ? T.green : val.status === 'error' ? T.red : T.yellow}`,
              }} />
              <span style={{
                fontSize: 11, fontWeight: 500, textTransform: 'capitalize',
                color: val.status === 'ok' ? T.green : val.status === 'error' ? T.red : T.yellow,
              }}>{key}</span>
            </div>
          ))}
        </div>
      )}

      {/* Cards grid */}
      <div className="home-cards-grid" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Active cards */}
        {active.map((c, i) => (
          <Link key={c.id} href={`/${c.id}`} style={{ textDecoration: 'none' }}>
            <div
              className="card-lift"
              style={{
                background: 'rgba(255,255,255,0.52)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                border: '1px solid rgba(255,255,255,0.82)',
                borderRadius: 18, padding: '20px 20px 16px',
                cursor: 'pointer', position: 'relative', overflow: 'hidden',
                boxShadow: '0 4px 20px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)',
                animation: `springIn 0.4s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.06}s both`,
              }}
            >
              {/* Color stripe */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                background: `linear-gradient(90deg, ${c.color}, ${c.color}60)`,
                borderRadius: '18px 18px 0 0',
              }} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em',
                  color: c.color,
                  background: c.color + '14',
                  padding: '3px 9px', borderRadius: 6,
                  border: `1px solid ${c.color}22`,
                }}>{c.label}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M9 18l6-6-6-6" stroke={c.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
                </svg>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: '-0.4px' }}>{c.title}</div>
                {cardStats[c.id] && (
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: c.color,
                    background: c.color + '14', border: `1px solid ${c.color}28`,
                    borderRadius: 8, padding: '4px 9px', whiteSpace: 'nowrap',
                    flexShrink: 0, marginTop: 2,
                  }}>{cardStats[c.id]}</div>
                )}
              </div>
              <div style={{ fontSize: 13, color: T.textSoft, marginBottom: 12, lineHeight: 1.5, fontWeight: 400 }}>{c.desc}</div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {c.bullets.map((b) => (
                  <div key={b} style={{ fontSize: 11, color: T.textMuted, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: c.color + '70' }} />{b}
                  </div>
                ))}
              </div>
            </div>
          </Link>
        ))}

        {/* Add connection */}
        <div onClick={() => setAddModalOpen(true)} style={{
          background: 'transparent',
          border: `2px dashed rgba(0,0,0,0.1)`,
          borderRadius: 18, padding: '22px 20px',
          cursor: 'pointer', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', minHeight: 120,
          transition: 'border-color 0.2s',
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            border: `2px dashed ${T.tealBrd}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, color: T.teal, marginBottom: 10,
            transition: 'transform 0.2s cubic-bezier(0.34,1.56,0.64,1)',
          }}>+</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.teal, marginBottom: 4 }}>Add connection</div>
          <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 400, textAlign: 'center' }}>
            Connect any website, RSS feed, or API
          </div>
        </div>

        <AddConnectionModal
          open={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          onAdded={() => { window.location.reload(); }}
        />

        {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
        <PomodoroWidget />

        {/* Inactive cards */}
        {inactive.map((c) => (
          <div key={c.id} style={{
            background: 'rgba(255,255,255,0.28)',
            border: `1px dashed rgba(0,0,0,0.1)`,
            borderRadius: 18, padding: '20px 20px 16px', opacity: 0.55,
          }}>
            <span style={{
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em',
              color: T.textMuted, background: 'rgba(0,0,0,0.06)', padding: '3px 9px', borderRadius: 6,
            }}>{c.label}</span>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.text, margin: '10px 0 4px' }}>{c.title}</div>
            <div style={{ fontSize: 13, color: T.textMuted, fontWeight: 400, marginBottom: 14 }}>{c.desc}</div>
            <Link href="/settings" style={{
              padding: '8px 16px',
              background: T.teal + '14',
              border: `1px solid ${T.tealBrd}`,
              borderRadius: 10, color: T.teal, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              textDecoration: 'none', display: 'inline-block',
            }}>Connect to enable</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
