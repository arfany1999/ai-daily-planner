'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { T, DOMAINS, inferDomainFromTitle } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import DayTicker from '@/components/DayTicker';

const TZ = 'Australia/Melbourne';
const HOUR_HEIGHT = 56;
const DAY_START = 6;
const DAY_END = 23;
const GUTTER = 48;

interface CalEvent {
  id: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  allDay: boolean;
  color?: string | null;
  isDeadline?: boolean;
}

type ViewMode = 'day' | 'week' | 'month';

/* ── helpers ──────────────────────────────────────────────────────────── */

function melbNow() { return new Date(new Date().toLocaleString('en-US', { timeZone: TZ })); }
function isoDate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function startOfWeek(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - d.getDay());
  return d;
}
function melbParts(iso: string): { h: number; m: number; date: string } {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const p = fmt.formatToParts(d);
  const g = (t: string) => parseInt(p.find(x => x.type === t)?.value || '0', 10);
  let h = g('hour'); if (h === 24) h = 0;
  return { h, m: g('minute'), date: `${g('year')}-${String(g('month')).padStart(2,'0')}-${String(g('day')).padStart(2,'0')}` };
}
function fmt12(iso: string): string {
  const { h, m } = melbParts(iso);
  const a = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${a}`;
}
function fmtHour(h: number) {
  if (h === 0) return '12';
  if (h === 12) return '12';
  return String(h > 12 ? h - 12 : h);
}
function eventDomain(ev: CalEvent) {
  if (ev.isDeadline) return { ...DOMAINS[0], color: '#E5604C' }; // red for deadlines
  return inferDomainFromTitle(ev.title);
}
function eventsOn(events: CalEvent[], dateStr: string): CalEvent[] {
  return events.filter(ev => ev.allDay ? ev.start.startsWith(dateStr) : melbParts(ev.start).date === dateStr);
}

/** Position overlapping events side-by-side. */
function layout(events: CalEvent[]) {
  const sorted = [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const colEnds: number[] = [];
  const out: { ev: CalEvent; col: number; totalCols: number }[] = [];
  for (const ev of sorted) {
    const s = new Date(ev.start).getTime();
    const e = Math.max(new Date(ev.end).getTime(), s + 15 * 60 * 1000);
    let col = colEnds.findIndex(x => x <= s);
    if (col === -1) { col = colEnds.length; colEnds.push(e); } else colEnds[col] = e;
    out.push({ ev, col, totalCols: 1 });
  }
  // second pass: compute max overlap
  for (const item of out) {
    const s = new Date(item.ev.start).getTime();
    const e = new Date(item.ev.end).getTime();
    let max = item.col;
    for (const other of out) {
      const os = new Date(other.ev.start).getTime();
      const oe = new Date(other.ev.end).getTime();
      if (os < e && oe > s) max = Math.max(max, other.col);
    }
    item.totalCols = max + 1;
  }
  return out;
}

/* ── Day view ────────────────────────────────────────────────────────── */

function DayView({ events, dateStr }: { events: CalEvent[]; dateStr: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const now = melbNow();
  const todayStr = isoDate(now);
  const isToday = dateStr === todayStr;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const currentTop = ((nowMins / 60) - DAY_START) * HOUR_HEIGHT;

  const dayEvs = eventsOn(events, dateStr);
  const allDay = dayEvs.filter(e => e.allDay);
  const timed = layout(dayEvs.filter(e => !e.allDay));
  const hours = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);

  useEffect(() => {
    if (!scrollRef.current) return;
    const target = isToday ? Math.max(0, currentTop - HOUR_HEIGHT * 2) : (8 - DAY_START) * HOUR_HEIGHT;
    scrollRef.current.scrollTop = target;
  }, [dateStr, isToday, currentTop]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {allDay.length > 0 && (
        <div style={{
          padding: '8px 14px', flexShrink: 0,
          borderBottom: '1px solid var(--border)',
          display: 'flex', flexWrap: 'wrap', gap: 6,
          background: 'var(--surface)',
        }}>
          <span style={{ fontSize: 9.5, color: T.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', alignSelf: 'center', marginRight: 2 }}>All day</span>
          {allDay.map(ev => {
            const d = eventDomain(ev);
            return (
              <div key={ev.id} style={{
                padding: '3px 10px', borderRadius: 6,
                fontSize: 11, fontWeight: 600,
                background: d.color + '22', color: d.color, border: `1px solid ${d.color}40`,
              }}>{ev.title}</div>
            );
          })}
        </div>
      )}

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
        <div style={{ position: 'relative', height: (DAY_END - DAY_START + 1) * HOUR_HEIGHT }}>
          {/* hour grid */}
          {hours.map(h => (
            <div key={h} style={{
              position: 'absolute', top: (h - DAY_START) * HOUR_HEIGHT, left: 0, right: 0, height: HOUR_HEIGHT,
              borderTop: h === DAY_START ? 'none' : '1px solid var(--border)',
            }}>
              <span className="mono" style={{
                position: 'absolute', left: 6, top: -7,
                fontSize: 10, color: T.textFaint, fontWeight: 600,
                userSelect: 'none', background: 'var(--bg)', padding: '0 4px',
              }}>{fmtHour(h)}</span>
            </div>
          ))}

          {/* current time */}
          {isToday && currentTop >= 0 && currentTop <= (DAY_END - DAY_START + 1) * HOUR_HEIGHT && (
            <div style={{
              position: 'absolute', top: currentTop, left: GUTTER - 8, right: 0, zIndex: 30,
              display: 'flex', alignItems: 'center', pointerEvents: 'none',
            }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%', background: '#E5604C',
                boxShadow: '0 0 0 3px rgba(229,96,76,0.25)', flexShrink: 0,
              }} />
              <div style={{ flex: 1, height: 2, background: '#E5604C' }} />
            </div>
          )}

          {/* events */}
          {timed.map(({ ev, col, totalCols }) => {
            const { h: sh, m: sm } = melbParts(ev.start);
            const { h: eh, m: em } = melbParts(ev.end);
            const s = sh * 60 + sm; const e = Math.max(eh * 60 + em, s + 15);
            const top = ((s / 60) - DAY_START) * HOUR_HEIGHT;
            const height = Math.max(((e - s) / 60) * HOUR_HEIGHT, 22);
            const d = eventDomain(ev);
            const short = height < 36;
            const colWidth = `calc((100% - ${GUTTER}px - 8px) / ${totalCols})`;
            const colLeft = `calc(${GUTTER}px + ${col} * (100% - ${GUTTER}px - 8px) / ${totalCols})`;
            return (
              <div key={ev.id} style={{
                position: 'absolute', top: top + 1, left: colLeft, width: colWidth,
                height: height - 2, zIndex: 10,
                background: d.color + '1a',
                borderLeft: `3px solid ${d.color}`,
                borderRadius: '0 6px 6px 0',
                padding: short ? '2px 7px' : '5px 8px',
                overflow: 'hidden',
                boxSizing: 'border-box',
                cursor: 'default',
                transition: 'transform 0.12s ease, background 0.12s ease',
              }}
              onMouseEnter={el => (el.currentTarget.style.background = d.color + '2a')}
              onMouseLeave={el => (el.currentTarget.style.background = d.color + '1a')}
              >
                <div style={{
                  fontSize: short ? 10.5 : 12, fontWeight: 600, color: d.color,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  lineHeight: 1.2,
                }}>{ev.title}</div>
                {!short && (
                  <div className="mono" style={{ fontSize: 9.5, color: d.color, opacity: 0.75, marginTop: 2, fontWeight: 500 }}>
                    {fmt12(ev.start)} – {fmt12(ev.end)}
                  </div>
                )}
              </div>
            );
          })}

          {timed.length === 0 && allDay.length === 0 && (
            <div style={{ position: 'absolute', top: '40%', left: 0, right: 0, textAlign: 'center', color: T.textFaint, fontSize: 12 }}>
              Nothing scheduled
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Week view ───────────────────────────────────────────────────────── */

function WeekView({ events, weekStart, onPickDay }: { events: CalEvent[]; weekStart: Date; onPickDay: (d: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const now = melbNow();
  const todayStr = isoDate(now);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const currentTop = ((nowMins / 60) - DAY_START) * HOUR_HEIGHT;
  const gutter = 36;

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d;
  });
  const hours = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, currentTop - HOUR_HEIGHT * 2);
  }, [currentTop]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface)' }}>
        <div style={{ width: gutter, flexShrink: 0 }} />
        {days.map(d => {
          const ds = isoDate(d);
          const isToday = ds === todayStr;
          return (
            <button key={ds} onClick={() => onPickDay(ds)} style={{
              flex: 1, textAlign: 'center', padding: '6px 2px',
              background: 'transparent', border: 'none', cursor: 'pointer',
              borderLeft: '1px solid var(--border-soft)',
            }}>
              <div className="mono" style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', color: T.textFaint, letterSpacing: '0.06em' }}>
                {d.toLocaleDateString('en-AU', { weekday: 'short' }).slice(0, 3)}
              </div>
              <div className="title-display" style={{
                fontSize: 16, fontWeight: 700, marginTop: 2, width: 26, height: 26,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '50%', margin: '2px auto 0',
                color: isToday ? '#fff' : T.text,
                background: isToday ? '#E5604C' : 'transparent',
              }}>{d.getDate()}</div>
            </button>
          );
        })}
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
        <div style={{ position: 'relative', height: (DAY_END - DAY_START + 1) * HOUR_HEIGHT, display: 'flex' }}>
          {/* time gutter */}
          <div style={{ width: gutter, flexShrink: 0, position: 'relative' }}>
            {hours.map(h => (
              <div key={h} style={{ position: 'absolute', top: (h - DAY_START) * HOUR_HEIGHT, left: 0, right: 0 }}>
                <span className="mono" style={{ position: 'absolute', right: 6, top: -6, fontSize: 9, color: T.textFaint, fontWeight: 600 }}>
                  {fmtHour(h)}
                </span>
              </div>
            ))}
          </div>

          {/* day columns */}
          {days.map(d => {
            const ds = isoDate(d);
            const isToday = ds === todayStr;
            const col = layout(eventsOn(events, ds).filter(e => !e.allDay));
            return (
              <div key={ds} style={{
                flex: 1, position: 'relative',
                borderLeft: '1px solid var(--border-soft)',
                background: isToday ? 'rgba(229,96,76,0.03)' : 'transparent',
              }}>
                {hours.map(h => (
                  <div key={h} style={{
                    position: 'absolute', top: (h - DAY_START) * HOUR_HEIGHT, left: 0, right: 0, height: HOUR_HEIGHT,
                    borderTop: h === DAY_START ? 'none' : '1px solid var(--border)',
                  }} />
                ))}
                <div onClick={() => onPickDay(ds)} style={{ position: 'absolute', inset: 0, zIndex: 1, cursor: 'pointer' }} />
                {col.map(({ ev, col: c, totalCols }) => {
                  const { h: sh, m: sm } = melbParts(ev.start);
                  const { h: eh, m: em } = melbParts(ev.end);
                  const s = sh * 60 + sm; const e = Math.max(eh * 60 + em, s + 15);
                  const top = ((s / 60) - DAY_START) * HOUR_HEIGHT;
                  const height = Math.max(((e - s) / 60) * HOUR_HEIGHT, 14);
                  const dm = eventDomain(ev);
                  return (
                    <div key={ev.id} style={{
                      position: 'absolute', zIndex: 5,
                      top: top + 1,
                      left: `calc(${c} * 100% / ${totalCols} + 1px)`,
                      width: `calc(100% / ${totalCols} - 2px)`,
                      height: Math.max(height - 2, 12),
                      background: dm.color + '26',
                      borderLeft: `2px solid ${dm.color}`,
                      borderRadius: '0 4px 4px 0',
                      padding: '2px 4px', overflow: 'hidden',
                    }}>
                      <div style={{ fontSize: 9.5, fontWeight: 600, color: dm.color, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ev.title}
                      </div>
                    </div>
                  );
                })}
                {isToday && currentTop >= 0 && (
                  <div style={{
                    position: 'absolute', top: currentTop, left: 0, right: 0, zIndex: 15,
                    height: 2, background: '#E5604C', pointerEvents: 'none',
                  }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Month view ──────────────────────────────────────────────────────── */

function MonthView({ events, baseDate, selectedDate, onPickDay }: { events: CalEvent[]; baseDate: Date; selectedDate: string; onPickDay: (d: string) => void }) {
  const todayStr = isoDate(melbNow());
  const y = baseDate.getFullYear(); const m = baseDate.getMonth();
  const start = new Date(y, m, 1); start.setDate(1 - start.getDay());
  const weeks = Array.from({ length: 6 }, (_, wi) => Array.from({ length: 7 }, (_, di) => {
    const d = new Date(start); d.setDate(start.getDate() + wi * 7 + di); return d;
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface)' }}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} className="mono" style={{ textAlign: 'center', padding: '8px 0', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.textFaint }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border-soft)', flex: 1, minHeight: 80 }}>
            {week.map(d => {
              const ds = isoDate(d);
              const inMonth = d.getMonth() === m;
              const isToday = ds === todayStr;
              const isSel = ds === selectedDate;
              const dayEvs = eventsOn(events, ds);
              return (
                <button key={ds} onClick={() => onPickDay(ds)} style={{
                  minHeight: 80, padding: '6px 5px', cursor: 'pointer',
                  borderRight: '1px solid var(--border-soft)', border: 'none',
                  background: isSel ? 'var(--teal-glow)' : 'transparent',
                  textAlign: 'left',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--surface-hover)'; }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                    <div className="title-display" style={{
                      width: 22, height: 22, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: isToday || isSel ? 700 : 500,
                      color: isToday ? '#fff' : isSel ? T.teal : inMonth ? T.text : T.textFaint,
                      background: isToday ? '#E5604C' : 'transparent',
                    }}>
                      {d.getDate()}
                    </div>
                  </div>
                  {dayEvs.slice(0, 3).map(ev => {
                    const dm = eventDomain(ev);
                    return (
                      <div key={ev.id} style={{
                        fontSize: 9.5, fontWeight: 600, padding: '2px 5px', borderRadius: 3, marginBottom: 2,
                        background: dm.color + '22', color: dm.color,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {ev.allDay ? ev.title : `${fmt12(ev.start).replace(' ', '')} ${ev.title}`}
                      </div>
                    );
                  })}
                  {dayEvs.length > 3 && (
                    <div className="mono" style={{ fontSize: 9, color: T.textMuted, paddingLeft: 5 }}>+{dayEvs.length - 3}</div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────────── */

export default function CalendarPage() {
  const sp = useSearchParams();
  const initialDate = sp.get('d') || isoDate(melbNow());
  const [view, setView] = useState<ViewMode>('week');
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const todayStr = isoDate(melbNow());
  const baseDate = useMemo(() => new Date(selectedDate + 'T00:00:00'), [selectedDate]);
  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate]);

  // Sync selectedDate from DayTicker custom event
  useEffect(() => {
    const h = (e: Event) => setSelectedDate((e as CustomEvent).detail as string);
    window.addEventListener('cmd-date-selected', h);
    return () => window.removeEventListener('cmd-date-selected', h);
  }, []);

  useEffect(() => {
    fetch('/api/auth/session').then(r => r.json()).then(s => setUserId(s?.userId || null)).catch(() => {});
    loadCalendar();
  }, []);

  async function loadCalendar() {
    setLoading(true);
    try {
      const [calRes, canvasRes] = await Promise.all([
        fetch('/api/calendar').then(r => r.json()).catch(() => ({})),
        fetch('/api/canvas').then(r => r.json()).catch(() => ({})),
      ]);
      const cal: CalEvent[] = calRes?.events || [];
      const deadlines: CalEvent[] = (canvasRes?.data?.assignments || [])
        .filter((a: { due_at: string | null }) => !!a.due_at)
        .map((a: { name: string; course_name: string; due_at: string }) => ({
          id: `canvas-${a.name}`,
          title: `${a.name} — ${a.course_name}`,
          description: 'Canvas deadline',
          start: a.due_at, end: a.due_at,
          allDay: false, color: null, isDeadline: true,
        }));
      setEvents([...cal, ...deadlines]);
      setStale(Boolean(calRes?.stale));
    } catch {
      setEvents([]);
    }
    setLoading(false);
  }

  // Realtime: refresh when calendar_cache changes for this user
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`cal-${userId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calendar_cache', filter: `user_id=eq.${userId}` },
        (payload) => {
          const fresh = (payload.new as { data: CalEvent[] })?.data || [];
          setEvents(prev => [...fresh, ...prev.filter(e => e.id.startsWith('canvas-'))]);
          setStale(false);
        })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  const shift = (dir: number) => {
    const d = new Date(selectedDate + 'T00:00:00');
    if (view === 'day') d.setDate(d.getDate() + dir);
    else if (view === 'week') d.setDate(d.getDate() + dir * 7);
    else { d.setMonth(d.getMonth() + dir); d.setDate(1); }
    setSelectedDate(isoDate(d));
  };

  const headerLabel = (() => {
    if (view === 'week') {
      const ws = weekStart; const we = new Date(ws); we.setDate(ws.getDate() + 6);
      const sm = ws.toLocaleDateString('en-AU', { month: 'short' });
      const em = we.toLocaleDateString('en-AU', { month: 'short' });
      return sm === em
        ? `${sm} ${ws.getDate()}–${we.getDate()}, ${ws.getFullYear()}`
        : `${sm} ${ws.getDate()} – ${em} ${we.getDate()}`;
    }
    return baseDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  })();

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: T.textMuted, fontSize: 13 }}>
        <div className="shimmer" style={{ width: 120, height: 14, borderRadius: 4, margin: '0 auto' }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - env(safe-area-inset-bottom))', overflow: 'hidden' }}>
      {/* DayTicker (always visible) */}
      <DayTicker selected={selectedDate} onSelect={setSelectedDate} daysBefore={14} daysAfter={60} />

      {/* Domain legend — color key for events */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        padding: '8px 14px',
        background: 'var(--glass)',
        borderBottom: '1px solid var(--border)',
        overflowX: 'auto',
      }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textFaint, marginRight: 4, flexShrink: 0 }}>Legend</span>
        {DOMAINS.map(d => (
          <div key={d.id} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 8px 3px 7px', borderRadius: 6,
            background: d.color + '18', border: `1px solid ${d.color}35`,
            flexShrink: 0,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
            <span style={{ fontSize: 10.5, fontWeight: 600, color: d.color, letterSpacing: '0.01em' }}>{d.label}</span>
          </div>
        ))}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '3px 8px 3px 7px', borderRadius: 6,
          background: 'rgba(229,96,76,0.15)', border: '1px solid rgba(229,96,76,0.40)',
          flexShrink: 0,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: '#E5604C' }} />
          <span style={{ fontSize: 10.5, fontWeight: 600, color: '#E5604C', letterSpacing: '0.01em' }}>Deadline</span>
        </div>
      </div>

      {/* Header: nav + title + view switcher */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--glass)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        display: 'flex', alignItems: 'center', gap: 8,
        flexShrink: 0,
      }}>
        <button onClick={() => shift(-1)} title="Previous" style={navBtn}>‹</button>
        <button onClick={() => shift(1)} title="Next" style={navBtn}>›</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="title-display" style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {headerLabel}
            {stale && <span className="mono" style={{ fontSize: 9, color: T.yellow, marginLeft: 8, background: 'var(--surface)', padding: '2px 6px', borderRadius: 4 }}>cached</span>}
          </div>
        </div>
        {/* View toggle */}
        <div style={{ display: 'flex', gap: 2, padding: 3, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
          {(['day', 'week', 'month'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 600,
              background: view === v ? 'var(--teal-glow)' : 'transparent',
              color: view === v ? T.teal : T.textMuted,
              textTransform: 'capitalize',
              transition: 'all 0.15s',
            }}>{v}</button>
          ))}
        </div>
        {selectedDate !== todayStr && (
          <button onClick={() => setSelectedDate(todayStr)} style={{
            padding: '5px 10px', borderRadius: 7, border: '1px solid var(--teal-brd)',
            background: 'var(--teal-glow)', color: T.teal,
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}>Today</button>
        )}
        <button onClick={loadCalendar} title="Refresh" style={navBtn}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M4 4v5h5M20 20v-5h-5M20.49 9A9 9 0 005.64 5.64L4 10m16 4l-1.64 4.36A9 9 0 013.51 15"
              stroke={T.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* View content */}
      <div key={view} className="anim-morph" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          const order: ViewMode[] = ['day','week','month'];
          const idx = order.indexOf(view);
          if (e.deltaY > 0 && idx < order.length - 1) setView(order[idx + 1]);
          else if (e.deltaY < 0 && idx > 0) setView(order[idx - 1]);
        }}>
        {view === 'day' && <DayView events={events} dateStr={selectedDate} />}
        {view === 'week' && <WeekView events={events} weekStart={weekStart} onPickDay={(d) => { setSelectedDate(d); setView('day'); }} />}
        {view === 'month' && <MonthView events={events} baseDate={baseDate} selectedDate={selectedDate} onPickDay={(d) => { setSelectedDate(d); setView('day'); }} />}
      </div>
    </div>
  );
}

const navBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 7,
  border: '1px solid var(--border)', background: 'var(--surface)', color: T.textSoft,
  fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0, transition: 'all 0.12s',
};
