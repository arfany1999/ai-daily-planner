'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { T, DOMAINS, inferDomainFromTitle, urgencyToDomain, melbSunTimes } from '@/lib/theme';
import DayTicker from '@/components/DayTicker';
import SkippedBlockCard from '@/components/SkippedBlockCard';

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
  const [ready, setReady] = useState(false);
  const [todayPlan, setTodayPlan] = useState<TodayPlan | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [calEvents, setCalEvents] = useState<CalEvent[]>([]);
  const [doneToday, setDoneToday] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [domainFilter, setDomainFilter] = useState<Record<string, boolean>>({});
  const [selectedDate, setSelectedDate] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: TZ }));
  const [expandedList, setExpandedList] = useState(false);
  const [wheelScroll, setWheelScroll] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // One-time: settings check, briefing, domain filter subscription
  useEffect(() => {
    Promise.all([
      fetch('/api/settings').then((r) => r.json()).catch(() => ({})),
      fetch('/api/briefing').then((r) => r.json()).catch(() => ({})),
    ]).then(([settings, briefD]) => {
      if (settings.setup_complete === false) { router.push('/setup'); return; }
      if (briefD.briefing) setBriefing(briefD.briefing as Briefing);
      setReady(true);
    }).catch(() => setReady(true));

    try { setDomainFilter(JSON.parse(localStorage.getItem('cmd-domains') || '{}')); } catch {}
    const h = (e: CustomEvent) => setDomainFilter(e.detail as Record<string, boolean>);
    window.addEventListener('cmd-domains-changed', h as EventListener);
    const r = () => window.location.reload();
    window.addEventListener('cmd-data-changed', r);
    return () => {
      window.removeEventListener('cmd-domains-changed', h as EventListener);
      window.removeEventListener('cmd-data-changed', r);
    };
  }, [router]);

  // Date-aware: reload plan + completions + calendar events for the selectedDate
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/today?date=${selectedDate}`).then((r) => r.json()).catch(() => ({})),
      fetch('/api/calendar').then((r) => r.json()).catch(() => ({})),
      fetch(`/api/progress?date=${selectedDate}`).then((r) => r.json()).catch(() => ({})),
    ]).then(([todayD, calD, progressD]) => {
      if (cancelled) return;
      setTodayPlan((todayD?.plan as TodayPlan | null) || null);
      // Filter calendar events to only those on the selected date
      const evs = (calD?.events as CalEvent[] | undefined) || [];
      const onDay = evs.filter(e => e.start.startsWith(selectedDate)).sort((a, b) => a.start.localeCompare(b.start));
      setCalEvents(onDay);
      // Completions for the selected date
      const ids = ((progressD?.today_tasks as { id: string; completed: boolean }[] | undefined) || [])
        .filter(t => t.completed).map(t => t.id);
      // progress endpoint may return completions for *today* regardless of param; fall back to todayD.completed_ids
      const completedIds = (todayD?.completed_ids as string[] | undefined) || ids;
      setDoneToday(new Set(completedIds));
    });
    return () => { cancelled = true; };
  }, [selectedDate]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const r = await fetch('/api/today/refresh', { method: 'POST' });
      const d = await r.json();
      if (d.plan) setTodayPlan(d.plan as TodayPlan);
    } catch {}
    setRefreshing(false);
  };

  const toggleTask = async (taskId: string) => {
    const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
    if (doneToday.has(taskId)) {
      setDoneToday(prev => { const n = new Set(prev); n.delete(taskId); return n; });
      await fetch('/api/tasks/uncomplete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: taskId, date: todayDate }) });
    } else {
      setDoneToday(prev => new Set([...prev, taskId]));
      await fetch('/api/tasks/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: taskId, date: todayDate }) });
    }
  };

  const mergedRaw = useMemo(() =>
    todayPlan?.timeline ? mergeTimeline(todayPlan.timeline, calEvents) : calEvents.map(calToBlock)
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
              onScroll={(e) => setWheelScroll((e.currentTarget as HTMLDivElement).scrollTop)}
              style={{
                height: expandedList ? 'auto' : 360,
                maxHeight: expandedList ? 'none' : 360,
                overflowY: expandedList ? 'visible' : 'auto',
                overflowX: 'hidden',
                position: 'relative',
                perspective: expandedList ? 'none' : '900px',
                perspectiveOrigin: 'center',
                scrollSnapType: expandedList ? 'none' : 'y mandatory',
                WebkitOverflowScrolling: 'touch',
                paddingTop: expandedList ? 0 : 140,
                paddingBottom: expandedList ? 0 : 140,
                // soft edge fade on collapsed wheel
                maskImage: expandedList ? 'none' : 'linear-gradient(180deg, transparent 0, black 22%, black 78%, transparent 100%)',
                WebkitMaskImage: expandedList ? 'none' : 'linear-gradient(180deg, transparent 0, black 22%, black 78%, transparent 100%)',
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
                const ROW = 76;
                const cardCenter = idx * ROW + ROW / 2 + (expandedList ? 0 : 140);
                const viewCenter = wheelScroll + (expandedList ? 0 : 180);
                const dist = expandedList ? 0 : (cardCenter - viewCenter) / ROW;
                const clamped = Math.max(-3, Math.min(3, dist));
                const rotateX = expandedList ? 0 : clamped * -14;
                const scale = expandedList ? 1 : Math.max(0.78, 1 - Math.abs(clamped) * 0.07);
                const wheelOpacity = expandedList ? 1 : Math.max(0.3, 1 - Math.abs(clamped) * 0.28);
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
