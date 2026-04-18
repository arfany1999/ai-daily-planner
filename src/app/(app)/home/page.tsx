'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { T, DOMAINS, inferDomainFromTitle, urgencyToDomain, melbSunTimes } from '@/lib/theme';
import DayTicker from '@/components/DayTicker';
import SkippedBlockCard from '@/components/SkippedBlockCard';
import { useAppData, usePlan } from '@/lib/app-cache';

const TZ = 'Australia/Melbourne';

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
interface Nudge { type: string; message: string; action_url?: string; }
interface TodayPlan {
  timeline: TimelineBlock[];
  top_priorities: string[];
  nudges: Nudge[];
  warnings: string[];
  pushed: { task_name: string; reason: string }[];
  summary: string;
}
interface CalEvent {
  id: string; title: string; start: string; end: string; allDay: boolean; color: string | null; isDeadline?: boolean;
}
interface BriefingDay { date: string; day_label: string; highlights: string[]; deadlines: string[]; priority_actions: string[]; }
interface Briefing { summary: string; days: BriefingDay[]; week_priorities: string[]; }

const NON_TASK = ['class','gym','work','break'];
const isTask = (b: TimelineBlock) => !NON_TASK.includes(b.urgency);

function melbHourNow() {
  return parseInt(new Date().toLocaleString('en-AU', { timeZone: TZ, hour: 'numeric', hour12: false }), 10);
}
function hmToMins(hm: string) {
  const [h, m] = hm.split(':').map(Number); return (h || 0) * 60 + (m || 0);
}
function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}
type BlockState = 'past' | 'now' | 'future';
function getBlockState(b: TimelineBlock, viewDate: string): BlockState {
  const today = todayISO();
  if (viewDate < today) return 'past';
  if (viewDate > today) return 'future';
  // Same day — compare times
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  if (nowMins >= hmToMins(b.end_time)) return 'past';
  if (nowMins >= hmToMins(b.start_time)) return 'now';
  return 'future';
}
function isBlockNow(b: TimelineBlock, viewDate: string) { return getBlockState(b, viewDate) === 'now'; }
function isBlockPast(b: TimelineBlock, viewDate: string) { return getBlockState(b, viewDate) === 'past'; }

function calToBlock(ev: CalEvent): TimelineBlock & { _fromCal?: boolean } {
  const fmtHM = (iso: string) => {
    if (!iso.includes('T')) return '00:00';
    return new Date(iso).toLocaleTimeString('en-AU', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  };
  const d = inferDomainFromTitle(ev.title);
  return {
    id: `gcal-${ev.id}`,
    start_time: ev.allDay ? '00:00' : fmtHM(ev.start),
    end_time: ev.allDay ? '23:59' : fmtHM(ev.end),
    task_name: ev.title,
    description: '',
    urgency: d.id === 'academia' ? 'class' : d.id === 'health' ? 'gym' : d.id === 'dev' ? 'work' : d.id === 'break' ? 'break' : 'amber',
    domain: d.id,
    _fromCal: true,
  };
}

function mergeTimeline(aiBlocks: TimelineBlock[], calEvents: CalEvent[]): TimelineBlock[] {
  const merged = [...aiBlocks];
  for (const ev of calEvents) {
    const cb = calToBlock(ev);
    const dup = aiBlocks.some(b => b.start_time === cb.start_time &&
      (b.task_name.toLowerCase().includes(ev.title.toLowerCase().slice(0, 10)) ||
       ev.title.toLowerCase().includes(b.task_name.toLowerCase().slice(0, 10))));
    if (!dup) merged.push(cb);
  }
  return merged.sort((a, b) => a.start_time.localeCompare(b.start_time));
}

function fmt12(hm: string) {
  const [h, m] = hm.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}

function DomainChip({ domainId, size = 'sm' }: { domainId: string; size?: 'sm' | 'md' }) {
  const d = DOMAINS.find(x => x.id === domainId) || DOMAINS[4];
  const pad = size === 'md' ? '3px 8px' : '2px 6px';
  const fs = size === 'md' ? 10 : 9;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: pad, borderRadius: 5,
      background: d.color + '18', color: d.color,
      border: `1px solid ${d.color}38`,
      fontSize: fs, fontWeight: 600, letterSpacing: '0.02em', textTransform: 'lowercase',
    }}>
      <span style={{ width: 4, height: 4, borderRadius: '50%', background: d.color }} />
      {d.label}
    </span>
  );
}

export default function HomePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const app = useAppData();
  const [domainFilter, setDomainFilter] = useState<Record<string, boolean>>({});
  const [selectedDate, setSelectedDate] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: TZ }));
  const [expandedList, setExpandedList] = useState(false);
  const [wheelScroll, setWheelScroll] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);

  // rAF-throttled scroll handler — without this, a single swipe fires
  // setWheelScroll ~60× per second, re-rendering every wheel card's
  // transform each time. With rAF, we coalesce to 1 update per frame.
  const onWheelScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      setWheelScroll(el.scrollTop);
    });
  }, []);

  // Pull from shared cache — no per-mount fetches
  const { plan: dayPlan, done: doneToday } = usePlan(selectedDate);
  const todayPlan: TodayPlan | null = dayPlan as unknown as TodayPlan | null;
  const briefing: Briefing | null = app.briefing as unknown as Briefing | null;
  const googleConnected: boolean | null = app.health
    ? app.health.checks?.google?.status === 'ok'
    : null;
  const ready = app.ready;

  // Redirect incomplete setup
  useEffect(() => {
    if (app.settings?.setup_complete === false) router.push('/setup');
  }, [app.settings, router]);

  // Filter calendar events to the selected day (from cached all-events list)
  const calEvents = useMemo(() => {
    return (app.calEvents || [])
      .filter(e => e.start.startsWith(selectedDate))
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [app.calEvents, selectedDate]);

  // Domain filter localStorage subscription
  useEffect(() => {
    try { setDomainFilter(JSON.parse(localStorage.getItem('cmd-domains') || '{}')); } catch {}
    const h = (e: CustomEvent) => setDomainFilter(e.detail as Record<string, boolean>);
    window.addEventListener('cmd-domains-changed', h as EventListener);
    return () => window.removeEventListener('cmd-domains-changed', h as EventListener);
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/today/refresh', { method: 'POST' });
      await app.refreshPlan(selectedDate);
    } catch {}
    setRefreshing(false);
  };

  const toggleTask = async (taskId: string) => {
    const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
    const wasDone = doneToday.has(taskId);
    // Optimistic flip — the cache will be revalidated after the write
    if (wasDone) {
      await fetch('/api/tasks/uncomplete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: taskId, date: todayDate }) });
    } else {
      await fetch('/api/tasks/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: taskId, date: todayDate }) });
    }
    app.refreshPlan(todayDate);
  };

  const mergedRaw = useMemo(() =>
    todayPlan?.timeline ? mergeTimeline(todayPlan.timeline as unknown as TimelineBlock[], calEvents) : calEvents.map(calToBlock)
  , [todayPlan, calEvents]);

  const merged = useMemo(() => mergedRaw.filter(b => {
    const dom = b.domain || urgencyToDomain(b.urgency).id;
    return domainFilter[dom] !== false;
  }), [mergedRaw, domainFilter]);

  const { sunrise, sunset } = useMemo(() => melbSunTimes(new Date()), []);
  const sunriseStr = sunrise.toLocaleTimeString('en-AU', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
  const sunsetStr = sunset.toLocaleTimeString('en-AU', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });

  // Anchor index — current block, else first upcoming, else last past
  const anchorIdx = useMemo(() => {
    const now = merged.findIndex(b => isBlockNow(b, selectedDate));
    if (now !== -1) return now;
    const next = merged.findIndex(b => !isBlockPast(b, selectedDate));
    if (next !== -1) return next;
    return Math.max(0, merged.length - 1);
  }, [merged, selectedDate]);

  // Auto-scroll wheel to anchor (current or next block) on first render + data refresh.
  // MUST run on every render (Rules of Hooks) — keep above any conditional return.
  useEffect(() => {
    if (!listRef.current || merged.length === 0) return;
    const el = listRef.current.querySelector(`[data-idx="${anchorIdx}"]`) as HTMLElement | null;
    if (el) {
      const container = listRef.current;
      const targetScroll = el.offsetTop - (container.clientHeight / 2) + (el.clientHeight / 2);
      container.scrollTop = Math.max(0, targetScroll);
      setWheelScroll(container.scrollTop);
    }
  }, [anchorIdx, merged.length, expandedList]);

  if (!ready) {
    return (
      <>
        {/* DayTicker skeleton */}
        <div className="dayticker">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div className="shimmer" style={{ width: 220, height: 18, borderRadius: 5 }} />
              <div className="shimmer" style={{ width: 80, height: 10, borderRadius: 4, marginTop: 8 }} />
            </div>
            <div className="shimmer" style={{ width: 62, height: 26, borderRadius: 8 }} />
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="shimmer" style={{ width: 52, height: 60, borderRadius: 12, flexShrink: 0 }} />
            ))}
          </div>
        </div>
        <div style={{ padding: '20px 16px 40px', maxWidth: 1100, margin: '0 auto' }}>
          {/* Greeting skeleton */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div className="shimmer" style={{ width: 110, height: 10, borderRadius: 3 }} />
              <div className="shimmer" style={{ width: '70%', maxWidth: 380, height: 32, borderRadius: 6, marginTop: 10 }} />
              <div className="shimmer" style={{ width: '60%', maxWidth: 300, height: 12, borderRadius: 4, marginTop: 10 }} />
            </div>
            <div className="shimmer" style={{ width: 140, height: 52, borderRadius: 12, flexShrink: 0 }} />
          </div>
          {/* Top priorities skeleton */}
          <div style={{ marginBottom: 20 }}>
            <div className="shimmer" style={{ width: 140, height: 10, borderRadius: 3, marginBottom: 8 }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="shimmer" style={{ height: 72, borderRadius: 14 }} />
              ))}
            </div>
          </div>
          {/* Timeline skeleton */}
          <div className="shimmer" style={{ width: 180, height: 10, borderRadius: 3, marginBottom: 10 }} />
          <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 14px', borderBottom: i < 4 ? '1px solid var(--border-soft)' : 'none' }}>
                <div className="shimmer" style={{ width: 3, alignSelf: 'stretch', minHeight: 26, borderRadius: 2 }} />
                <div className="shimmer" style={{ width: 50, height: 30, borderRadius: 4 }} />
                <div className="shimmer" style={{ width: 18, height: 18, borderRadius: 5 }} />
                <div className="shimmer" style={{ flex: 1, height: 18, borderRadius: 4 }} />
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  const firstName = session?.user?.name?.split(' ')[0] || session?.user?.email?.split('@')[0]?.split('.')[0] || 'there';
  const hour = melbHourNow();
  const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Night owl';

  const allTasks = merged.filter(isTask);
  const pendingTasks = allTasks.filter(t => !doneToday.has(t.id));
  const doneCount = doneToday.size;
  const nowBlock = merged.find(b => isBlockNow(b, selectedDate));
  const nextBlock = merged.find(b => !isBlockPast(b, selectedDate) && !isBlockNow(b, selectedDate));

  // Study-coach: past-ended task blocks not marked complete → show skip card (max 2)
  const skippedBlocks = allTasks.filter(b => isBlockPast(b, selectedDate) && !doneToday.has(b.id)).slice(0, 2);
  const todayDateStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ });

  // 5-item focus window around the anchor (2 before + anchor + 2 after)
  const windowStart = Math.max(0, Math.min(anchorIdx - 2, Math.max(0, merged.length - 5)));
  const windowEnd = Math.min(merged.length, windowStart + 5);
  const pastCount = windowStart;
  const futureCount = Math.max(0, merged.length - windowEnd);
  const visibleMerged = expandedList ? merged : merged.slice(windowStart, windowEnd);

  const topPriorities = todayPlan?.top_priorities?.slice(0, 3) || [];
  const nudges = todayPlan?.nudges?.slice(0, 3) || [];

  return (
    <>
      <DayTicker selected={selectedDate} onSelect={setSelectedDate} daysBefore={7} daysAfter={60} />

      {/* Google Calendar connection banner — shows until user connects */}
      {googleConnected === false && (
        <div style={{
          margin: '10px 16px 0',
          padding: '14px 16px',
          background: 'linear-gradient(135deg, var(--teal-glow), rgba(110,139,232,0.08))',
          border: '1px solid var(--teal-brd)',
          borderRadius: 14,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}>
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.9 33.6 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.7 29.2 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.2-2.7-.4-3.9z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.4 18.8 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.7 29.2 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5 0 9.6-1.6 13.2-4.4l-6.1-5.2C29 36 26.6 36.7 24 36.7c-5.4 0-9.9-3.4-11.5-8.2l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.1 5.2C36.9 39.2 44 34 44 24c0-1.3-.2-2.7-.4-3.9z"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, letterSpacing: '-0.01em', marginBottom: 2 }}>
              Connect Google Calendar
            </div>
            <div style={{ fontSize: 11.5, color: T.textSoft, lineHeight: 1.4 }}>
              AI Planner mirrors your schedule 1:1 with Google. Every block you create here lands on your calendar.
            </div>
          </div>
          <button
            onClick={async () => {
              const r = await fetch('/api/auth/google-connect', { method: 'POST' }).catch(() => null);
              if (r) { const { url } = await r.json().catch(() => ({ url: null })); if (url) { window.location.href = url; return; } }
              // Fallback: re-auth via NextAuth to grant calendar scope
              window.location.href = '/api/auth/signin/google';
            }}
            style={{
              flexShrink: 0,
              padding: '8px 14px', borderRadius: 9,
              background: `linear-gradient(135deg, var(--teal-dk), var(--teal-lt))`,
              color: '#fff', border: 'none',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 12px var(--teal-glow)',
            }}
          >Connect</button>
        </div>
      )}

      <div style={{ padding: '18px 16px 40px', maxWidth: 1100, margin: '0 auto' }}>
        {/* Greeting — minimal, single column */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 11, color: T.textFaint, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {greeting}, {firstName}
          </div>
          <h1 className="title-display" style={{
            fontSize: 26, fontWeight: 700, color: T.text, letterSpacing: '-0.03em', lineHeight: 1.15, marginTop: 4,
          }}>
            {selectedDate !== todayDateStr
              ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-AU', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' })
              : nowBlock ? nowBlock.task_name.slice(0, 50)
              : nextBlock ? `Next · ${nextBlock.task_name.slice(0, 40)}`
              : pendingTasks.length === 0 ? 'Nothing left today.'
              : "Today's plan"}
          </h1>
          <div className="mono" style={{ fontSize: 11, color: T.textFaint, marginTop: 6, letterSpacing: '0.02em' }}>
            {doneCount}/{allTasks.length} done
            {selectedDate === todayDateStr && nowBlock && ` · ${fmt12(nowBlock.start_time)}–${fmt12(nowBlock.end_time)}`}
            {selectedDate === todayDateStr && !nowBlock && nextBlock && ` · at ${fmt12(nextBlock.start_time)}`}
            {selectedDate !== todayDateStr && ` · ${selectedDate < todayDateStr ? 'past' : 'upcoming'}`}
            <span className="hide-mobile"> · ↑{sunriseStr} ↓{sunsetStr}</span>
          </div>
        </div>

        {/* Top 3 priorities — desktop only (mobile: already visible in timeline as urgent) */}
        {topPriorities.length > 0 && (
          <div className="hide-mobile anim-slide" style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10.5, color: T.textFaint, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
              Today · top priorities
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              {topPriorities.map((p, i) => {
                const dom = inferDomainFromTitle(p);
                return (
                  <div key={i} className="card-lift" style={{
                    padding: '12px 14px', background: 'var(--surface)', borderRadius: 14,
                    border: `1px solid ${dom.color}28`, position: 'relative', overflow: 'hidden',
                  }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: dom.color }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span className="mono" style={{ fontSize: 11, color: dom.color, fontWeight: 700 }}>{String(i + 1).padStart(2, '0')}</span>
                      <DomainChip domainId={dom.id} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.35 }}>{p}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Study-coach: skipped blocks */}
        {skippedBlocks.length > 0 && (
          <div className="anim-slide" style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10.5, color: T.textFaint, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
              Coach · unresolved
            </div>
            {skippedBlocks.map(b => (
              <SkippedBlockCard key={b.id} block={b} date={todayDateStr} />
            ))}
          </div>
        )}

        {/* Timeline — minimal, one-line rows */}
        <div className="anim-slide" style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 10.5, color: T.textFaint, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Today
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {merged.length > 5 && (
                <button onClick={() => setExpandedList(v => !v)}
                  style={{
                    fontSize: 11, padding: '3px 9px', borderRadius: 6,
                    background: expandedList ? 'var(--teal-glow)' : 'transparent',
                    border: '1px solid ' + (expandedList ? 'var(--teal-brd)' : 'var(--border)'),
                    color: expandedList ? T.teal : T.textMuted,
                    cursor: 'pointer', fontWeight: 600,
                  }}>{expandedList ? 'Focus' : `All (${merged.length})`}</button>
              )}
              <button onClick={refresh} disabled={refreshing}
                style={{
                  fontSize: 11, padding: '3px 9px', borderRadius: 6,
                  background: 'transparent', border: '1px solid var(--border)',
                  color: refreshing ? T.textFaint : T.textMuted, cursor: refreshing ? 'wait' : 'pointer',
                }}>{refreshing ? '…' : 'Refresh'}</button>
            </div>
          </div>

          {merged.length === 0 ? (
            <div style={{
              padding: '32px 16px', textAlign: 'center',
              color: T.textMuted, fontSize: 13,
              background: 'var(--surface)', borderRadius: 14, border: '1px dashed var(--border)',
            }}>
              Nothing scheduled. Tap <span className="mono" style={{ background: 'var(--surface-hi)', padding: '1px 5px', borderRadius: 4 }}>⌘K</span> to add a block.
            </div>
          ) : (
            <div
              ref={listRef}
              onScroll={onWheelScroll}
              style={{
                height: expandedList ? 'auto' : 460,
                maxHeight: expandedList ? 'none' : 460,
                overflowY: expandedList ? 'visible' : 'auto',
                overflowX: 'hidden',
                position: 'relative',
                perspective: expandedList ? 'none' : '1200px',
                perspectiveOrigin: 'center',
                scrollSnapType: expandedList ? 'none' : 'y mandatory',
                WebkitOverflowScrolling: 'touch',
                // 190 = (460 - 80) / 2; centers row 1 while allowing first/last to reach center
                paddingTop: expandedList ? 0 : 190,
                paddingBottom: expandedList ? 0 : 190,
                // softer edge fade so the trio (past/now/future) stays crisp
                maskImage: expandedList ? 'none' : 'linear-gradient(180deg, transparent 0, black 14%, black 86%, transparent 100%)',
                WebkitMaskImage: expandedList ? 'none' : 'linear-gradient(180deg, transparent 0, black 14%, black 86%, transparent 100%)',
              }}
            >
              {merged.map((b, idx) => {
                const dom = DOMAINS.find(d => d.id === (b.domain || urgencyToDomain(b.urgency).id)) || DOMAINS[4];
                const state = getBlockState(b, selectedDate);
                const now = state === 'now';
                const past = state === 'past';
                const done = doneToday.has(b.id);
                const isTaskBlock = isTask(b);

                // Wheel transform: distance from container center
                const ROW = 80;
                const cardCenter = idx * ROW + ROW / 2 + (expandedList ? 0 : 190);
                const viewCenter = wheelScroll + (expandedList ? 0 : 230);
                const dist = expandedList ? 0 : (cardCenter - viewCenter) / ROW;
                // Much gentler curve: the trio (±1 row) stays almost flat, further rows curve away
                const clamped = Math.max(-3, Math.min(3, dist));
                const rotateX = expandedList ? 0 : clamped * -7;
                const scale = expandedList ? 1 : Math.max(0.85, 1 - Math.abs(clamped) * 0.035);
                const wheelOpacity = expandedList ? 1 : Math.max(0.45, 1 - Math.abs(clamped) * 0.18);
                const translateZ = expandedList ? 0 : -Math.abs(clamped) * 32;
                const isCenter = Math.abs(clamped) < 0.5;

                // State-based styling (stronger differentiation)
                const stateBg = now
                  ? `linear-gradient(135deg, ${dom.color}22, ${dom.color}10)`
                  : past
                    ? 'transparent'
                    : 'var(--surface)';
                const stateBorder = now
                  ? `${dom.color}80`
                  : past
                    ? 'var(--border-soft)'
                    : 'var(--border)';
                const stateTitleColor = now
                  ? T.text
                  : past
                    ? T.textMuted
                    : T.text;
                const stateOpacity = done
                  ? 0.38
                  : past
                    ? 0.58
                    : 1;
                const stateFilter = past && !done ? 'saturate(0.55)' : 'none';

                return (
                  <button
                    key={b.id}
                    data-idx={idx}
                    onClick={() => isTaskBlock && toggleTask(b.id)}
                    disabled={!isTaskBlock}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                      padding: now ? '16px 16px' : '14px 16px',
                      marginBottom: 8,
                      height: now ? 76 : 68,
                      background: stateBg,
                      border: `${now ? 1.5 : 1}px solid ${stateBorder}`,
                      borderRadius: 14,
                      position: 'relative',
                      overflow: 'hidden',
                      cursor: isTaskBlock ? 'pointer' : 'default',
                      textAlign: 'left',
                      transform: `rotateX(${rotateX}deg) scale(${scale}) translateZ(${translateZ}px)`,
                      transformOrigin: 'center',
                      transformStyle: 'preserve-3d',
                      opacity: stateOpacity * wheelOpacity,
                      filter: stateFilter,
                      transition: 'transform 0.05s linear, opacity 0.05s linear, border-color 0.15s',
                      boxShadow: now
                        ? `0 10px 28px ${dom.color}30, 0 0 0 1.5px ${dom.color}50, inset 0 0 0 1px ${dom.color}15`
                        : isCenter && !expandedList
                          ? `0 6px 18px ${dom.color}20, 0 0 0 1px ${dom.color}30`
                          : 'none',
                      scrollSnapAlign: 'center',
                      scrollSnapStop: 'always',
                    }}
                  >
                    {/* Left color stripe — thicker when "now" */}
                    <div style={{
                      position: 'absolute', top: 0, left: 0, bottom: 0,
                      width: now ? 5 : 4,
                      background: past ? T.textFaint : dom.color,
                    }} />

                    {/* Now glow pulse on left edge */}
                    {now && (
                      <div style={{
                        position: 'absolute', top: 0, left: 0, bottom: 0, width: 3,
                        background: dom.color,
                        boxShadow: `0 0 12px ${dom.color}, 0 0 24px ${dom.color}80`,
                        animation: 'pulse-dot 1.4s ease-in-out infinite',
                      }} />
                    )}

                    <div className="mono" style={{
                      marginLeft: now ? 6 : 4,
                      width: 60,
                      fontSize: now ? 14 : 13,
                      color: now ? dom.color : past ? T.textFaint : T.textMuted,
                      fontWeight: 700, flexShrink: 0, lineHeight: 1.2, letterSpacing: '-0.02em',
                    }}>
                      {fmt12(b.start_time).replace(/ (am|pm)/, '')}
                      <span style={{ fontSize: 10, color: past ? T.textFaint : T.textFaint, fontWeight: 500 }}>{fmt12(b.start_time).match(/(am|pm)$/)?.[0] || ''}</span>
                    </div>

                    <div style={{
                      width: now ? 13 : 11, height: now ? 13 : 11, borderRadius: '50%',
                      background: done ? dom.color : now ? dom.color : 'transparent',
                      border: `2px solid ${past ? T.textFaint : dom.color}`,
                      flexShrink: 0,
                      boxShadow: now ? `0 0 0 5px ${dom.color}30, 0 0 12px ${dom.color}` : 'none',
                      transition: 'all 0.2s',
                    }} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {now && (
                          <span style={{
                            fontSize: 9, fontWeight: 800, color: '#fff',
                            background: dom.color,
                            padding: '2px 6px', borderRadius: 4,
                            letterSpacing: '0.08em', textTransform: 'uppercase',
                            flexShrink: 0,
                          }}>NOW</span>
                        )}
                        <div className="title-display" style={{
                          fontSize: now ? 17 : 16,
                          fontWeight: now ? 800 : past ? 600 : 700,
                          color: stateTitleColor,
                          textDecoration: done ? 'line-through' : 'none',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          lineHeight: 1.3, letterSpacing: '-0.02em',
                        }}>{b.task_name}</div>
                      </div>
                      {b.description && (
                        <div style={{
                          fontSize: 12, color: past ? T.textFaint : T.textMuted, marginTop: 3,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{b.description}</div>
                      )}
                    </div>

                    {done && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: dom.color }}>
                        <path d="M4 12l6 6L20 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Nudges & warnings — desktop only; mobile already has coach + timeline */}
        {(nudges.length > 0 || (todayPlan?.warnings || []).length > 0) && (
          <div className="hide-mobile anim-slide" style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10.5, color: T.textFaint, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
              Nudges
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
              {nudges.map((n, i) => (
                <Link key={i} href={n.action_url || '#'} style={{
                  padding: '10px 12px', borderRadius: 12, border: '1px solid var(--teal-brd)',
                  background: 'var(--teal-glow)', textDecoration: 'none',
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}>
                  <div style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--teal-dk)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 700, flexShrink: 0 }}>!</div>
                  <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.5 }}>{n.message}</div>
                </Link>
              ))}
              {(todayPlan?.warnings || []).map((w, i) => (
                <div key={'w' + i} style={{
                  padding: '10px 12px', borderRadius: 12,
                  background: 'rgba(229,96,76,0.08)', border: '1px solid rgba(229,96,76,0.24)',
                  fontSize: 12.5, color: T.red, lineHeight: 1.5,
                }}>⚠ {w}</div>
              ))}
            </div>
          </div>
        )}

        {/* Briefing summary — desktop only */}
        {briefing?.summary && (
          <div className="hide-mobile anim-slide" style={{
            marginBottom: 18,
            padding: '14px 16px', borderRadius: 14,
            background: 'var(--surface)', border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 20, height: 20, borderRadius: 6, background: 'linear-gradient(135deg, var(--yellow), var(--orange))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>☀</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.text, letterSpacing: '0.02em' }}>Morning Briefing</span>
            </div>
            <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.55 }}>{briefing.summary}</div>
            {briefing.week_priorities?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {briefing.week_priorities.slice(0, 4).map((p, i) => (
                  <span key={i} style={{
                    padding: '3px 9px', borderRadius: 6,
                    background: 'var(--teal-glow)', color: T.teal, border: '1px solid var(--teal-brd)',
                    fontSize: 11, fontWeight: 500,
                  }}>{p}</span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="hide-mobile" style={{ fontSize: 10.5, color: T.textFaint, textAlign: 'center', marginTop: 30 }}>
          Press <span className="mono" style={{ background: 'var(--surface)', padding: '2px 6px', borderRadius: 4 }}>⌘K</span> for anything.
        </div>
      </div>
    </>
  );
}
