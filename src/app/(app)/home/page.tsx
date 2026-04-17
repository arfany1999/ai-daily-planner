'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useMemo } from 'react';
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
function isBlockNow(b: TimelineBlock) {
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  return nowMins >= hmToMins(b.start_time) && nowMins < hmToMins(b.end_time);
}
function isBlockPast(b: TimelineBlock) {
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  return nowMins >= hmToMins(b.end_time);
}

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

  useEffect(() => {
    Promise.all([
      fetch('/api/settings').then((r) => r.json()).catch(() => ({})),
      fetch('/api/today').then((r) => r.json()).catch(() => ({})),
      fetch('/api/progress').then((r) => r.json()).catch(() => ({})),
      fetch('/api/calendar').then((r) => r.json()).catch(() => ({})),
      fetch('/api/briefing').then((r) => r.json()).catch(() => ({})),
    ]).then(([settings, todayD, progressD, calD, briefD]) => {
      if (settings.setup_complete === false) { router.push('/setup'); return; }
      if (todayD.plan) setTodayPlan(todayD.plan as TodayPlan);
      if (progressD.today_tasks) {
        const ids = progressD.today_tasks.filter((t: { completed: boolean }) => t.completed).map((t: { id: string }) => t.id);
        setDoneToday(new Set(ids));
      }
      if (calD.events) {
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
        const todayEvs = (calD.events as CalEvent[]).filter(e => e.start.startsWith(todayStr)).sort((a, b) => a.start.localeCompare(b.start));
        setCalEvents(todayEvs);
      }
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
  const nowBlock = merged.find(isBlockNow);
  const nextBlock = merged.find(b => !isBlockPast(b) && !isBlockNow(b));

  // Study-coach: past-ended task blocks not marked complete → show skip card (max 2)
  const skippedBlocks = allTasks.filter(b => isBlockPast(b) && !doneToday.has(b.id)).slice(0, 2);
  const todayDateStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ });

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
            {nowBlock ? nowBlock.task_name.slice(0, 50) :
             nextBlock ? `Next · ${nextBlock.task_name.slice(0, 40)}` :
             pendingTasks.length === 0 ? 'Nothing left today.' : "Today's plan"}
          </h1>
          <div className="mono" style={{ fontSize: 11, color: T.textFaint, marginTop: 6, letterSpacing: '0.02em' }}>
            {doneCount}/{allTasks.length} done
            {nowBlock && ` · ${fmt12(nowBlock.start_time)}–${fmt12(nowBlock.end_time)}`}
            {!nowBlock && nextBlock && ` · at ${fmt12(nextBlock.start_time)}`}
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
            <button onClick={refresh} disabled={refreshing}
              style={{
                fontSize: 11, padding: '3px 9px', borderRadius: 6,
                background: 'transparent', border: '1px solid var(--border)',
                color: refreshing ? T.textFaint : T.textMuted, cursor: refreshing ? 'wait' : 'pointer',
              }}>{refreshing ? '…' : 'Refresh'}</button>
          </div>
          <div style={{
            background: 'var(--surface)',
            borderRadius: 14,
            border: '1px solid var(--border)',
            overflow: 'hidden',
          }}>
            {merged.length === 0 && (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: T.textMuted, fontSize: 12.5 }}>
                Nothing scheduled. Tap <span className="mono" style={{ background: 'var(--surface-hi)', padding: '1px 5px', borderRadius: 4 }}>⌘K</span> to add a block.
              </div>
            )}
            {merged.map((b, i) => {
              const dom = DOMAINS.find(d => d.id === (b.domain || urgencyToDomain(b.urgency).id)) || DOMAINS[4];
              const now = isBlockNow(b);
              const past = isBlockPast(b);
              const done = doneToday.has(b.id);
              const isTaskBlock = isTask(b);
              return (
                <button
                  key={b.id + '-' + i}
                  onClick={() => isTaskBlock && toggleTask(b.id)}
                  disabled={!isTaskBlock}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                    padding: '12px 14px',
                    borderBottom: i < merged.length - 1 ? '1px solid var(--border-soft)' : 'none',
                    background: 'transparent', borderLeft: 'none', borderRight: 'none', borderTop: 'none',
                    cursor: isTaskBlock ? 'pointer' : 'default',
                    opacity: done ? 0.42 : past ? 0.58 : 1,
                    textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (isTaskBlock) e.currentTarget.style.background = 'var(--surface-hover)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div className="mono" style={{
                    width: 58, fontSize: 11, color: now ? dom.color : T.textMuted,
                    fontWeight: 700, flexShrink: 0, lineHeight: 1.25,
                  }}>
                    {fmt12(b.start_time).replace(/ (am|pm)/, '')}
                    <span style={{ fontSize: 9, color: T.textFaint, fontWeight: 500 }}>{fmt12(b.start_time).match(/(am|pm)$/)?.[0] || ''}</span>
                  </div>
                  <div style={{
                    width: 9, height: 9, borderRadius: '50%',
                    background: done ? dom.color : 'transparent',
                    border: `2px solid ${dom.color}`,
                    flexShrink: 0,
                    boxShadow: now ? `0 0 0 4px ${dom.color}25` : 'none',
                    transition: 'all 0.2s',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13.5, fontWeight: 700,
                      color: now ? T.text : past || done ? T.textSoft : T.text,
                      textDecoration: done ? 'line-through' : 'none',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      lineHeight: 1.35, letterSpacing: '-0.01em',
                    }}>{b.task_name}</div>
                  </div>
                </button>
              );
            })}
          </div>
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
