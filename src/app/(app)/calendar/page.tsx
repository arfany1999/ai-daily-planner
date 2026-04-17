'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { T } from '@/lib/theme';
import { supabase } from '@/lib/supabase';

const TZ = 'Australia/Melbourne';
const HOUR_HEIGHT = 64;
const DAY_START = 6;
const DAY_END = 23;

// Google Calendar colorId → hex
const GCAL_COLORS: Record<string, string> = {
  '1': '#7986CB', '2': '#33B679', '3': '#8E24AA', '4': '#E67C73',
  '5': '#F6BF26', '6': '#F4511E', '7': '#039BE5', '8': '#757575',
  '9': '#3F51B5', '10': '#0B8043', '11': '#D50000',
};

interface CalEvent {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  allDay: boolean;
  color: string | null;
  isDeadline?: boolean;
}

interface PositionedEvent {
  ev: CalEvent;
  col: number;
  totalCols: number;
}

type ViewMode = 'day' | 'week' | 'month' | 'year' | 'agenda';

// ── helpers ────────────────────────────────────────────────────────────────

function melbNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Robust Melbourne time extraction — avoids locale string parsing pitfalls
function getMelbParts(isoStr: string): { hours: number; minutes: number; dateStr: string } {
  const d = new Date(isoStr);
  const fmt = new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value || '0');
  const year = get('year'); const month = get('month'); const day = get('day');
  let hours = get('hour'); const minutes = get('minute');
  if (hours === 24) hours = 0;
  return {
    hours, minutes,
    dateStr: `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,
  };
}

function fmt12(isoStr: string): string {
  const { hours, minutes } = getMelbParts(isoStr);
  const ampm = hours >= 12 ? 'pm' : 'am';
  const h = hours % 12 || 12;
  return `${h}:${String(minutes).padStart(2, '0')} ${ampm}`;
}

function fmtHour(h: number): string {
  if (h === 0) return '12 am';
  if (h < 12) return `${h} am`;
  if (h === 12) return '12 pm';
  return `${h - 12} pm`;
}

function startOfWeek(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function eventColor(ev: CalEvent): string {
  if (ev.isDeadline) return '#D50000';
  if (ev.color && GCAL_COLORS[ev.color]) return GCAL_COLORS[ev.color];
  const t = ev.title.toLowerCase();
  if (t.includes('[ai]') || t.includes('study') || t.includes('focus')) return '#4a6ef5';
  if (t.includes('gym') || t.includes('workout') || t.includes('run')) return '#0B8043';
  if (t.includes('lecture') || t.includes('tutorial') || t.includes('prac') || t.includes('lab')) return '#039BE5';
  if (t.includes('work') || t.includes('meeting') || t.includes('standup')) return '#F4511E';
  if (t.includes('lunch') || t.includes('dinner') || t.includes('break')) return '#F6BF26';
  return '#4a6ef5';
}

function getEventsForDate(events: CalEvent[], dateStr: string): CalEvent[] {
  return events.filter(ev => {
    if (ev.allDay) return ev.start.startsWith(dateStr);
    return getMelbParts(ev.start).dateStr === dateStr;
  });
}

// Assign columns to overlapping events for side-by-side rendering
function layoutTimedEvents(events: CalEvent[]): PositionedEvent[] {
  const sorted = [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const colEnds: number[] = []; // ms end time of last event in each column
  const assignments: { ev: CalEvent; col: number }[] = [];

  for (const ev of sorted) {
    const start = new Date(ev.start).getTime();
    const end = Math.max(new Date(ev.end).getTime(), start + 20 * 60 * 1000);
    let col = colEnds.findIndex(colEnd => colEnd <= start);
    if (col === -1) { col = colEnds.length; colEnds.push(end); }
    else colEnds[col] = end;
    assignments.push({ ev, col });
  }

  // For each event, find totalCols = max column index among concurrent overlapping events + 1
  return assignments.map(({ ev, col }) => {
    const start = new Date(ev.start).getTime();
    const end = new Date(ev.end).getTime();
    let maxCol = col;
    for (const { ev: o, col: oc } of assignments) {
      if (new Date(o.start).getTime() < end && new Date(o.end).getTime() > start) {
        maxCol = Math.max(maxCol, oc);
      }
    }
    return { ev, col, totalCols: maxCol + 1 };
  });
}

// ── View toggle ─────────────────────────────────────────────────────────────

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const views: { key: ViewMode; label: string }[] = [
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'year', label: 'Year' },
    { key: 'agenda', label: 'Agenda' },
  ];
  return (
    <div style={{ display: 'flex', gap: 2, padding: 3, background: 'rgba(0,0,0,0.06)', borderRadius: 10 }}>
      {views.map(v => (
        <button key={v.key} onClick={() => onChange(v.key)} style={{
          padding: '4px 9px', borderRadius: 8, border: 'none', cursor: 'pointer',
          fontSize: 11, fontWeight: 600,
          background: view === v.key ? '#fff' : 'transparent',
          color: view === v.key ? T.text : T.textMuted,
          boxShadow: view === v.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
          transition: 'all 0.18s',
        }}>{v.label}</button>
      ))}
    </div>
  );
}

// ── Week strip ────────────────────────────────────────────────────────────────

function WeekStrip({ baseDate, selected, onSelect, eventDates }: {
  baseDate: Date; selected: string; onSelect: (d: string) => void; eventDates: Set<string>;
}) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(baseDate); d.setDate(baseDate.getDate() + i); return d;
  });
  const todayStr = isoDate(melbNow());
  return (
    <div style={{ display: 'flex', gap: 4, padding: '10px 0 6px', overflowX: 'auto' }}>
      {days.map((d) => {
        const ds = isoDate(d);
        const isToday = ds === todayStr;
        const isSel = ds === selected;
        const hasEvents = eventDates.has(ds);
        return (
          <button key={ds} onClick={() => onSelect(ds)} style={{
            flex: '0 0 auto', minWidth: 42,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            padding: '6px 4px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: isSel ? T.teal : isToday ? T.teal + '18' : 'rgba(255,255,255,0.06)',
            transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
            transform: isSel ? 'scale(1.06)' : 'scale(1)',
          }}>
            <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: isSel ? 'rgba(255,255,255,0.75)' : T.textMuted }}>
              {d.toLocaleDateString('en-AU', { timeZone: TZ, weekday: 'short' }).slice(0, 3)}
            </span>
            <span style={{ fontSize: 16, fontWeight: 700, color: isSel ? '#fff' : isToday ? T.teal : T.text }}>
              {d.getDate()}
            </span>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: hasEvents ? (isSel ? 'rgba(255,255,255,0.08)' : T.teal) : 'transparent' }} />
          </button>
        );
      })}
    </div>
  );
}

// ── Day timeline ────────────────────────────────────────────────────────────

function DayTimeline({ events, selectedDate }: { events: CalEvent[]; selectedDate: string }) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const now = melbNow();
  const todayStr = isoDate(now);
  const isToday = selectedDate === todayStr;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const currentTop = ((nowMins / 60) - DAY_START) * HOUR_HEIGHT;

  const dayEvents = getEventsForDate(events, selectedDate);
  const allDayEvents = dayEvents.filter(ev => ev.allDay);
  const timedEvents = dayEvents.filter(ev => !ev.allDay);
  const positioned = layoutTimedEvents(timedEvents);

  const hours = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);
  const GUTTER = 52; // px for time labels

  useEffect(() => {
    if (!timelineRef.current) return;
    const scrollTo = isToday
      ? Math.max(0, currentTop - HOUR_HEIGHT * 2)
      : (8 - DAY_START) * HOUR_HEIGHT;
    timelineRef.current.scrollTop = scrollTo;
  }, [selectedDate, isToday, currentTop]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {allDayEvents.length > 0 && (
        <div style={{
          padding: '8px 16px', flexShrink: 0,
          background: 'transparent',
          borderBottom: '1px solid rgba(0,0,0,0.07)',
          display: 'flex', flexWrap: 'wrap', gap: 5,
        }}>
          <span style={{ fontSize: 9, color: T.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', alignSelf: 'center', marginRight: 4 }}>All day</span>
          {allDayEvents.map(ev => {
            const c = eventColor(ev);
            return (
              <div key={ev.id} style={{
                padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: c + '28', color: c, border: `1px solid ${c}50`,
              }}>{ev.title}</div>
            );
          })}
        </div>
      )}

      <div ref={timelineRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
        <div style={{ position: 'relative', height: (DAY_END - DAY_START) * HOUR_HEIGHT }}>

          {/* Hour lines + labels */}
          {hours.map((h) => (
            <div key={h} style={{
              position: 'absolute', top: (h - DAY_START) * HOUR_HEIGHT,
              left: 0, right: 0, height: HOUR_HEIGHT,
              borderTop: '1px solid rgba(0,0,0,0.07)',
              pointerEvents: 'none',
            }}>
              <span style={{
                position: 'absolute', left: 8, top: -9,
                fontSize: 10, color: T.textMuted, fontWeight: 500, userSelect: 'none',
              }}>
                {fmtHour(h)}
              </span>
            </div>
          ))}

          {/* Half-hour dashes */}
          {hours.map((h) => (
            <div key={`${h}-h`} style={{
              position: 'absolute',
              top: (h - DAY_START) * HOUR_HEIGHT + HOUR_HEIGHT / 2,
              left: GUTTER, right: 0,
              borderTop: '1px dashed rgba(0,0,0,0.05)',
              pointerEvents: 'none',
            }} />
          ))}

          {/* Current time bar */}
          {isToday && currentTop >= 0 && currentTop <= (DAY_END - DAY_START) * HOUR_HEIGHT && (
            <div style={{
              position: 'absolute', top: currentTop, left: GUTTER - 6, right: 0, zIndex: 20,
              display: 'flex', alignItems: 'center', pointerEvents: 'none',
            }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%', background: '#D50000', flexShrink: 0,
                boxShadow: '0 0 0 3px rgba(213,0,0,0.2)', zIndex: 21,
              }} />
              <div style={{ flex: 1, height: 2, background: '#D50000', opacity: 0.9 }} />
            </div>
          )}

          {/* Timed events */}
          {positioned.map(({ ev, col, totalCols }) => {
            const { hours: sh, minutes: sm } = getMelbParts(ev.start);
            const { hours: eh, minutes: em } = getMelbParts(ev.end);
            const startMins = sh * 60 + sm;
            const endMins = eh * 60 + em;
            const topPx = ((startMins / 60) - DAY_START) * HOUR_HEIGHT;
            const heightPx = Math.max(((endMins - startMins) / 60) * HOUR_HEIGHT, 28);
            const color = eventColor(ev);
            const isShort = heightPx < 40;
            const colWidth = `calc((100% - ${GUTTER}px - 10px) / ${totalCols})`;
            const colLeft = `calc(${GUTTER}px + ${col} * (100% - ${GUTTER}px - 10px) / ${totalCols})`;

            return (
              <div key={ev.id} style={{
                position: 'absolute',
                top: topPx + 2,
                left: colLeft,
                width: colWidth,
                height: Math.max(heightPx - 4, 24),
                zIndex: 10,
                background: color + '22',
                borderLeft: `3px solid ${color}`,
                borderRadius: '0 8px 8px 0',
                padding: isShort ? '3px 6px' : '5px 8px',
                overflow: 'hidden',
                cursor: 'default',
                boxSizing: 'border-box',
              }}>
                <div style={{
                  fontSize: isShort ? 10 : 11, fontWeight: 700, color,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  lineHeight: 1.2,
                }}>
                  {ev.title}
                </div>
                {!isShort && (
                  <div style={{ fontSize: 9, color, opacity: 0.8, marginTop: 2, fontWeight: 500 }}>
                    {fmt12(ev.start)} – {fmt12(ev.end)}
                  </div>
                )}
              </div>
            );
          })}

          {timedEvents.length === 0 && allDayEvents.length === 0 && (
            <div style={{ position: 'absolute', top: '30%', left: 0, right: 0, textAlign: 'center', color: T.textMuted, fontSize: 12 }}>
              No events
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Week view ─────────────────────────────────────────────────────────────────

function WeekView({ events, weekStart, onSelectDay }: { events: CalEvent[]; weekStart: Date; onSelectDay: (d: string) => void }) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const now = melbNow();
  const todayStr = isoDate(now);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const currentTop = ((nowMins / 60) - DAY_START) * HOUR_HEIGHT;
  const GUTTER = 36;

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d;
  });
  const hours = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);

  useEffect(() => {
    if (!timelineRef.current) return;
    timelineRef.current.scrollTop = Math.max(0, currentTop - HOUR_HEIGHT * 2);
  }, [currentTop]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{
        display: 'flex', borderBottom: '1px solid rgba(0,0,0,0.08)',
        background: 'transparent', flexShrink: 0,
      }}>
        <div style={{ width: GUTTER, flexShrink: 0 }} />
        {days.map(d => {
          const ds = isoDate(d);
          const isToday = ds === todayStr;
          return (
            <div key={ds} onClick={() => onSelectDay(ds)} style={{
              flex: 1, textAlign: 'center', padding: '5px 2px', cursor: 'pointer',
              borderLeft: '1px solid rgba(0,0,0,0.05)',
            }}>
              <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', color: T.textMuted, letterSpacing: '0.04em' }}>
                {d.toLocaleDateString('en-AU', { weekday: 'short' }).slice(0, 3)}
              </div>
              <div style={{
                fontSize: 14, fontWeight: 800,
                color: isToday ? '#fff' : T.text,
                width: 26, height: 26, borderRadius: '50%',
                background: isToday ? T.teal : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '2px auto 0',
              }}>
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      <div ref={timelineRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
        <div style={{ position: 'relative', height: (DAY_END - DAY_START) * HOUR_HEIGHT, display: 'flex' }}>
          {/* Time gutter */}
          <div style={{ width: GUTTER, flexShrink: 0, position: 'relative' }}>
            {hours.map(h => (
              <div key={h} style={{ position: 'absolute', top: (h - DAY_START) * HOUR_HEIGHT, left: 0, right: 0 }}>
                <span style={{ position: 'absolute', right: 4, top: -7, fontSize: 8, color: T.textMuted, fontWeight: 500 }}>
                  {fmtHour(h)}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((d) => {
            const ds = isoDate(d);
            const isToday = ds === todayStr;
            const dayEvs = getEventsForDate(events, ds).filter(e => !e.allDay);
            const positioned = layoutTimedEvents(dayEvs);

            return (
              <div key={ds} style={{
                flex: 1, position: 'relative',
                borderLeft: '1px solid rgba(0,0,0,0.06)',
                background: isToday ? T.teal + '06' : 'transparent',
              }}>
                {hours.map(h => (
                  <div key={h} style={{
                    position: 'absolute', top: (h - DAY_START) * HOUR_HEIGHT, left: 0, right: 0, height: HOUR_HEIGHT,
                    borderTop: '1px solid rgba(0,0,0,0.05)',
                  }} />
                ))}
                {isToday && currentTop >= 0 && (
                  <div style={{
                    position: 'absolute', top: currentTop, left: 0, right: 0, zIndex: 10,
                    height: 2, background: '#D50000', opacity: 0.9,
                  }} />
                )}
                {/* Click overlay */}
                <div onClick={() => onSelectDay(ds)} style={{ position: 'absolute', inset: 0, zIndex: 1, cursor: 'pointer' }} />
                {positioned.map(({ ev, col, totalCols }) => {
                  const { hours: sh, minutes: sm } = getMelbParts(ev.start);
                  const { hours: eh, minutes: em } = getMelbParts(ev.end);
                  const startMins = sh * 60 + sm;
                  const endMins = eh * 60 + em;
                  const topPx = ((startMins / 60) - DAY_START) * HOUR_HEIGHT;
                  const heightPx = Math.max(((endMins - startMins) / 60) * HOUR_HEIGHT, 14);
                  const color = eventColor(ev);
                  return (
                    <div key={ev.id} style={{
                      position: 'absolute', zIndex: 5,
                      top: topPx + 1,
                      left: `calc(${col} * 100% / ${totalCols} + 1px)`,
                      width: `calc(100% / ${totalCols} - 2px)`,
                      height: Math.max(heightPx - 2, 12),
                      background: color + '28',
                      borderLeft: `2.5px solid ${color}`,
                      borderRadius: '0 4px 4px 0',
                      padding: '2px 3px', overflow: 'hidden',
                    }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ev.title}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Current time full-width dot */}
          {currentTop >= 0 && currentTop <= (DAY_END - DAY_START) * HOUR_HEIGHT && (
            <div style={{
              position: 'absolute', top: currentTop, left: GUTTER, right: 0, zIndex: 15,
              pointerEvents: 'none',
              display: 'flex', alignItems: 'center',
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#D50000', boxShadow: '0 0 0 2px rgba(213,0,0,0.25)', flexShrink: 0 }} />
              <div style={{ flex: 1, height: 2, background: '#D50000', opacity: 0.7 }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Month view ────────────────────────────────────────────────────────────────

function MonthView({ events, baseDate, selectedDate, onSelectDay }: {
  events: CalEvent[]; baseDate: Date; selectedDate: string; onSelectDay: (d: string) => void;
}) {
  const todayStr = isoDate(melbNow());
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const startGrid = new Date(firstDay);
  startGrid.setDate(1 - firstDay.getDay());

  const weeks = Array.from({ length: 6 }, (_, wi) =>
    Array.from({ length: 7 }, (_, di) => {
      const d = new Date(startGrid);
      d.setDate(startGrid.getDate() + wi * 7 + di);
      return d;
    })
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid rgba(0,0,0,0.08)', flexShrink: 0 }}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} style={{ textAlign: 'center', padding: '6px 0', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: T.textMuted }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ flex: 1 }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            {week.map(d => {
              const ds = isoDate(d);
              const isCurrentMonth = d.getMonth() === month;
              const isToday = ds === todayStr;
              const isSel = ds === selectedDate;
              const dayEvs = getEventsForDate(events, ds);

              return (
                <div key={ds} onClick={() => onSelectDay(ds)} style={{
                  minHeight: 68, padding: '5px 4px', cursor: 'pointer',
                  borderRight: '1px solid rgba(0,0,0,0.04)',
                  background: isSel ? T.teal + '10' : isToday ? T.teal + '08' : 'transparent',
                  transition: 'background 0.15s',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 3 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: isToday || isSel ? 700 : 400,
                      color: isToday ? '#fff' : isSel ? T.teal : isCurrentMonth ? T.text : T.textMuted,
                      background: isToday ? T.teal : 'transparent',
                      border: isSel && !isToday ? `1.5px solid ${T.teal}` : 'none',
                    }}>
                      {d.getDate()}
                    </div>
                  </div>
                  {dayEvs.slice(0, 2).map(ev => {
                    const c = eventColor(ev);
                    return (
                      <div key={ev.id} style={{
                        fontSize: 9, fontWeight: 600, padding: '1px 4px', borderRadius: 3, marginBottom: 2,
                        background: c + '28', color: c,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {ev.allDay ? ev.title : `${fmt12(ev.start)} ${ev.title}`}
                      </div>
                    );
                  })}
                  {dayEvs.length > 2 && (
                    <div style={{ fontSize: 9, color: T.textMuted, paddingLeft: 4 }}>+{dayEvs.length - 2} more</div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Year view ────────────────────────────────────────────────────────────────

function MiniMonth({ year, month, eventDates, onSelectMonth }: {
  year: number; month: number; eventDates: Set<string>; onSelectMonth: (y: number, m: number) => void;
}) {
  const todayStr = isoDate(melbNow());
  const firstDay = new Date(year, month, 1);
  const startGrid = new Date(firstDay);
  startGrid.setDate(1 - firstDay.getDay());
  const cells = Array.from({ length: 35 }, (_, i) => {
    const d = new Date(startGrid); d.setDate(startGrid.getDate() + i); return d;
  });
  const monthName = firstDay.toLocaleDateString('en-AU', { month: 'short' });
  const isCurrentMonth = todayStr.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`);

  return (
    <div onClick={() => onSelectMonth(year, month)} style={{
      background: 'transparent', borderRadius: 12, padding: '8px 6px', cursor: 'pointer',
      border: isCurrentMonth ? `1.5px solid ${T.teal}50` : '1px solid rgba(0,0,0,0.06)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: isCurrentMonth ? T.teal : T.text, marginBottom: 4, textAlign: 'center' }}>
        {monthName}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 7, color: T.textMuted, fontWeight: 700, marginBottom: 1 }}>{d}</div>
        ))}
        {cells.map((d, i) => {
          const ds = isoDate(d);
          const inMonth = d.getMonth() === month;
          const isToday = ds === todayStr;
          const hasEvent = eventDates.has(ds) && inMonth;
          return (
            <div key={i} style={{
              textAlign: 'center', fontSize: 8, width: 14, height: 14, margin: '0 auto',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '50%', position: 'relative',
              color: isToday ? '#fff' : inMonth ? T.text : 'transparent',
              fontWeight: isToday ? 700 : 400,
              background: isToday ? T.teal : 'transparent',
            }}>
              {inMonth ? d.getDate() : ''}
              {hasEvent && !isToday && (
                <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 3, height: 3, borderRadius: '50%', background: T.teal }} />
              )}
            </div>
          );
        })}
      </div>
      {(() => {
        const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
        const count = [...eventDates].filter(d => d.startsWith(monthStr)).length;
        return count > 0 ? (
          <div style={{ textAlign: 'center', fontSize: 9, color: T.teal, marginTop: 3, fontWeight: 600 }}>
            {count}d w/ events
          </div>
        ) : null;
      })()}
    </div>
  );
}

function YearView({ events, year, onSelectMonth }: {
  events: CalEvent[]; year: number; onSelectMonth: (y: number, m: number) => void;
}) {
  const eventDates = new Set(events.map(ev => getMelbParts(ev.start).dateStr));
  return (
    <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: '12px 10px 24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {Array.from({ length: 12 }, (_, m) => (
          <MiniMonth key={m} year={year} month={m} eventDates={eventDates} onSelectMonth={onSelectMonth} />
        ))}
      </div>
    </div>
  );
}

// ── Agenda view ───────────────────────────────────────────────────────────────

function AgendaView({ events, fromDate, onSelectDay }: {
  events: CalEvent[]; fromDate: string; onSelectDay: (d: string) => void;
}) {
  const todayStr = isoDate(melbNow());
  const startD = new Date(fromDate + 'T00:00:00');
  const days = Array.from({ length: 90 }, (_, i) => {
    const d = new Date(startD); d.setDate(startD.getDate() + i); return d;
  });
  const daysWithEvents = days.filter(d => getEventsForDate(events, isoDate(d)).length > 0);

  if (daysWithEvents.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: T.textMuted, fontSize: 13 }}>
        No upcoming events in the next 90 days
      </div>
    );
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: '8px 0 24px' }}>
      {daysWithEvents.map(d => {
        const ds = isoDate(d);
        const isToday = ds === todayStr;
        const dayEvs = getEventsForDate(events, ds).sort((a, b) => {
          if (a.allDay && !b.allDay) return -1;
          if (!a.allDay && b.allDay) return 1;
          return a.start.localeCompare(b.start);
        });

        return (
          <div key={ds}>
            <div onClick={() => onSelectDay(ds)} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 6px', cursor: 'pointer',
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                background: isToday ? T.teal : 'rgba(255,255,255,0.08)',
                border: isToday ? 'none' : '1px solid rgba(0,0,0,0.08)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', color: isToday ? 'rgba(255,255,255,0.5)' : T.textMuted, lineHeight: 1 }}>
                  {d.toLocaleDateString('en-AU', { weekday: 'short' }).toUpperCase()}
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: isToday ? '#fff' : T.text, lineHeight: 1.1 }}>
                  {d.getDate()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: isToday ? T.teal : T.text }}>
                  {d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
                  {isToday && <span style={{ marginLeft: 8, fontSize: 9, background: T.teal + '18', color: T.teal, padding: '2px 6px', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase' }}>Today</span>}
                </div>
                <div style={{ fontSize: 10, color: T.textMuted }}>{dayEvs.length} event{dayEvs.length !== 1 ? 's' : ''}</div>
              </div>
            </div>

            <div style={{ paddingLeft: 64, paddingRight: 16, display: 'flex', flexDirection: 'column', gap: 5, paddingBottom: 8 }}>
              {dayEvs.map(ev => {
                const color = eventColor(ev);
                return (
                  <div key={ev.id} style={{
                    background: color + '16', borderLeft: `3px solid ${color}`,
                    borderRadius: '0 10px 10px 0', padding: '8px 12px',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.title}
                      </div>
                      {ev.description && (
                        <div style={{ fontSize: 10, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ev.description}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {ev.allDay ? 'All day' : `${fmt12(ev.start)} – ${fmt12(ev.end)}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Sidebar mini-month (desktop left panel) ───────────────────────────────────

function SidebarMiniMonth({ events, selectedDate, onSelectDay }: {
  events: CalEvent[]; selectedDate: string; onSelectDay: (d: string) => void;
}) {
  const todayStr = isoDate(melbNow());
  const base = new Date(selectedDate + 'T00:00:00');
  const year = base.getFullYear();
  const month = base.getMonth();
  const [navMonth, setNavMonth] = useState(month);
  const [navYear, setNavYear] = useState(year);

  useEffect(() => {
    setNavMonth(new Date(selectedDate + 'T00:00:00').getMonth());
    setNavYear(new Date(selectedDate + 'T00:00:00').getFullYear());
  }, [selectedDate]);

  const eventDates = new Set(events.map(ev => getMelbParts(ev.start).dateStr));
  const firstDay = new Date(navYear, navMonth, 1);
  const startGrid = new Date(firstDay);
  startGrid.setDate(1 - firstDay.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(startGrid); d.setDate(startGrid.getDate() + i); return d;
  });

  const shiftMonth = (dir: number) => {
    const d = new Date(navYear, navMonth + dir, 1);
    setNavMonth(d.getMonth());
    setNavYear(d.getFullYear());
  };

  return (
    <div style={{ padding: '16px 14px 12px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button onClick={() => shiftMonth(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, fontSize: 16, padding: '2px 6px', borderRadius: 6 }}>‹</button>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
          {new Date(navYear, navMonth, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
        </span>
        <button onClick={() => shiftMonth(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, fontSize: 16, padding: '2px 6px', borderRadius: 6 }}>›</button>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: T.textMuted, padding: '2px 0' }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
        {cells.map((d, i) => {
          const ds = isoDate(d);
          const inMonth = d.getMonth() === navMonth;
          const isToday = ds === todayStr;
          const isSel = ds === selectedDate;
          const hasEvent = eventDates.has(ds) && inMonth;
          return (
            <div key={i} onClick={() => { if (inMonth) onSelectDay(ds); }} style={{
              textAlign: 'center', width: 28, height: 28, margin: '0 auto',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '50%', cursor: inMonth ? 'pointer' : 'default',
              fontSize: 11, fontWeight: isSel || isToday ? 700 : 400,
              color: isToday ? '#fff' : isSel ? '#fff' : inMonth ? T.text : T.textMuted,
              background: isToday ? T.teal : isSel ? T.tealDk : 'transparent',
              position: 'relative',
              transition: 'background 0.12s',
            }}>
              {inMonth ? d.getDate() : ''}
              {hasEvent && !isToday && !isSel && (
                <div style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', width: 3, height: 3, borderRadius: '50%', background: T.teal }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Upcoming list (desktop left panel) ────────────────────────────────────────

function UpcomingList({ events, onSelectDay }: {
  events: CalEvent[]; onSelectDay: (d: string) => void;
}) {
  const todayStr = isoDate(melbNow());
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(todayStr + 'T00:00:00'); d.setDate(d.getDate() + i); return d;
  });
  const daysWithEvents = days.filter(d => getEventsForDate(events, isoDate(d)).length > 0);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0 20px' }}>
      <div style={{ padding: '0 14px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textMuted }}>
        Upcoming
      </div>
      {daysWithEvents.length === 0 && (
        <div style={{ padding: '16px 14px', fontSize: 11, color: T.textMuted }}>No upcoming events</div>
      )}
      {daysWithEvents.map(d => {
        const ds = isoDate(d);
        const isToday = ds === todayStr;
        const dayEvs = getEventsForDate(events, ds).filter(e => !e.allDay).sort((a, b) => a.start.localeCompare(b.start));
        const allDay = getEventsForDate(events, ds).filter(e => e.allDay);
        const all = [...allDay, ...dayEvs];
        return (
          <div key={ds} onClick={() => onSelectDay(ds)} style={{ padding: '6px 14px', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ fontSize: 10, fontWeight: 700, color: isToday ? T.teal : T.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {isToday ? 'Today' : d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>
            {all.slice(0, 3).map(ev => {
              const color = eventColor(ev);
              return (
                <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <div style={{ width: 3, height: 14, borderRadius: 2, background: color, flexShrink: 0 }} />
                  <div style={{ fontSize: 11, color: T.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {ev.title}
                  </div>
                  {!ev.allDay && (
                    <div style={{ fontSize: 9, color: T.textMuted, flexShrink: 0 }}>{fmt12(ev.start)}</div>
                  )}
                </div>
              );
            })}
            {all.length > 3 && <div style={{ fontSize: 9, color: T.textMuted, marginLeft: 9 }}>+{all.length - 3} more</div>}
          </div>
        );
      })}
    </div>
  );
}

// ── Connect prompt ────────────────────────────────────────────────────────────

function ConnectPrompt() {
  return (
    <div style={{ padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16 }}>
      <div style={{
        width: 64, height: 64, borderRadius: 20,
        background: 'transparent', backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="4" width="18" height="17" rx="3" stroke={T.teal} strokeWidth="1.8" fill={T.tealGlow} />
          <path d="M16 2v4M8 2v4M3 9h18" stroke={T.teal} strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="8" cy="14" r="1.5" fill={T.teal} />
          <circle cx="12" cy="14" r="1.5" fill={T.teal} />
          <circle cx="16" cy="14" r="1.5" fill={T.teal} />
        </svg>
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: '-0.4px', marginBottom: 6 }}>
          Connect Google Calendar
        </div>
        <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.6, maxWidth: 280 }}>
          Sign in with Google to see your calendar events here as a live mirror.
        </div>
      </div>
      <Link href="/settings" style={{
        padding: '13px 28px',
        background: `linear-gradient(135deg,${T.tealDk},${T.teal})`,
        color: '#fff', borderRadius: 14, fontSize: 14, fontWeight: 600,
        textDecoration: 'none', boxShadow: `0 6px 20px ${T.tealGlow}`,
      }}>
        Go to Settings
      </Link>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { data: session } = useSession();
  const userId = (session as unknown as Record<string, unknown>)?.userId as string | undefined;

  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [connected, setConnected] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<ViewMode>('day');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'live'>('idle');

  const todayStr = isoDate(melbNow());
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const baseDate = new Date(selectedDate + 'T00:00:00');
  const weekStart = startOfWeek(selectedDate);

  const headerLabel = (() => {
    if (view === 'year') return String(baseDate.getFullYear());
    if (view === 'agenda') return 'Upcoming';
    if (view === 'week') {
      const ws = weekStart;
      const we = new Date(ws); we.setDate(ws.getDate() + 6);
      const sm = ws.toLocaleDateString('en-AU', { month: 'short' });
      const em = we.toLocaleDateString('en-AU', { month: 'short' });
      return sm === em
        ? `${sm} ${ws.getDate()}–${we.getDate()}, ${ws.getFullYear()}`
        : `${sm} ${ws.getDate()} – ${em} ${we.getDate()}, ${ws.getFullYear()}`;
    }
    return baseDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  })();

  useEffect(() => { loadCalendar(); }, []);

  // ── Supabase Realtime: update calendar instantly when background sync writes ──
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`cal-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'calendar_cache', filter: `user_id=eq.${userId}` },
        (payload) => {
          const freshEvents = (payload.new as { data: CalEvent[] }).data || [];
          setEvents(prev => {
            // Keep any canvas deadline overlays, merge with fresh Google events
            const canvasEvs = prev.filter(e => e.id.startsWith('canvas-'));
            return [...freshEvents, ...canvasEvs];
          });
          setStale(false);
          setSyncStatus('live');
          // Flash "live" back to idle after 3s
          setTimeout(() => setSyncStatus('idle'), 3000);
        }
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  // ── Supabase Realtime: canvas deadlines update ────────────────────────────
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`canvas-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'canvas_cache', filter: `user_id=eq.${userId}` },
        (payload) => {
          const canvasData = payload.new as { data?: { assignments?: { name: string; course_name: string; due_at: string | null }[] } };
          if (canvasData?.data?.assignments) {
            const deadlines: CalEvent[] = canvasData.data.assignments
              .filter(a => !!a.due_at)
              .map(a => ({
                id: `canvas-${a.name}`,
                title: `${a.name} — ${a.course_name}`,
                description: 'Assignment deadline',
                start: a.due_at!,
                end: a.due_at!,
                allDay: false,
                color: null,
                isDeadline: true,
              }));
            setEvents(prev => [...prev.filter(e => !e.id.startsWith('canvas-')), ...deadlines]);
          }
        }
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  const loadCalendar = async () => {
    setLoading(true);
    try {
      const calRes = await fetch('/api/calendar');
      const calData = await calRes.json();
      if (calData?.error || (!calData?.events && !calData?.stale)) {
        setConnected(false); setLoading(false); return;
      }
      setEvents(calData?.events || []);
      setStale(calData?.stale || false);
      setConnected(true);
      setLoading(false);

      fetch('/api/canvas').then(r => r.json()).then(canvasData => {
        if (canvasData?.data?.assignments) {
          const deadlines: CalEvent[] = canvasData.data.assignments
            .filter((a: { due_at: string | null }) => !!a.due_at)
            .map((a: { name: string; course_name: string; due_at: string }) => ({
              id: `canvas-${a.name}`, title: `${a.name} — ${a.course_name}`,
              description: 'Assignment deadline', start: a.due_at, end: a.due_at,
              allDay: false, color: null, isDeadline: true,
            }));
          if (deadlines.length > 0) setEvents(prev => [...prev, ...deadlines]);
        }
      }).catch(() => {});
    } catch {
      setConnected(false); setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const r = await fetch('/api/calendar');
      const d = await r.json();
      if (d.events) { setEvents(d.events); setStale(false); }
    } catch { /* keep current */ }
    setRefreshing(false);
  };

  const shiftPeriod = (dir: number) => {
    const d = new Date(selectedDate + 'T00:00:00');
    if (view === 'day') d.setDate(d.getDate() + dir);
    else if (view === 'week') d.setDate(d.getDate() + dir * 7);
    else if (view === 'year') d.setFullYear(d.getFullYear() + dir);
    else if (view === 'agenda') d.setDate(d.getDate() + dir * 30);
    else { d.setMonth(d.getMonth() + dir); d.setDate(1); }
    setSelectedDate(isoDate(d));
  };

  const handleSelectDay = (ds: string) => { setSelectedDate(ds); setView('day'); };
  const handleSelectMonth = (y: number, m: number) => {
    const d = new Date(y, m, 1);
    setSelectedDate(isoDate(d));
    setView('month');
  };

  const eventDates = new Set(events.map(ev => getMelbParts(ev.start).dateStr));

  if (loading) {
    return (
      <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textMuted, fontSize: 13 }}>
        Loading calendar…
      </div>
    );
  }

  if (!connected) {
    return (
      <div style={{ padding: '0 0 80px' }}>
        <div style={{ padding: '16px 20px 8px' }}>
          <div style={{ fontSize: 21, fontWeight: 700, color: T.text, letterSpacing: '-0.5px' }}>Calendar</div>
        </div>
        <ConnectPrompt />
      </div>
    );
  }

  return (
    <div className="calendar-shell calendar-page-root">

      {/* Desktop left panel */}
      <div className="calendar-left-panel">
        <SidebarMiniMonth events={events} selectedDate={selectedDate} onSelectDay={handleSelectDay} />
        <UpcomingList events={events} onSelectDay={handleSelectDay} />
      </div>

      {/* Right panel (all views) */}
      <div className="calendar-right-panel">

      {/* Header */}
      <div className="glass" style={{
        padding: '10px 14px 0',
        flexShrink: 0,
        borderBottom: '1px solid var(--border)',
      }}>
        {/* Nav row + view toggle in one line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <button onClick={() => shiftPeriod(-1)} style={{
            width: 28, height: 28, borderRadius: 8, border: 'none',
            background: 'transparent', color: T.textMuted,
            fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>‹</button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: '-0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
              {headerLabel}
              {syncStatus === 'live' && (
                <span style={{ fontSize: 9, color: T.green, marginLeft: 6, fontWeight: 700 }}>● live</span>
              )}
              {syncStatus === 'idle' && stale && (
                <span style={{ fontSize: 9, color: T.yellow, marginLeft: 6 }}>cached</span>
              )}
            </span>
          </div>

          <button onClick={() => shiftPeriod(1)} style={{
            width: 28, height: 28, borderRadius: 8, border: 'none',
            background: 'transparent', color: T.textMuted,
            fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>›</button>

          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.1)', flexShrink: 0 }} />

          <ViewToggle view={view} onChange={setView} />

          <button onClick={() => setSelectedDate(todayStr)} style={{
            padding: '4px 10px', borderRadius: 7, border: `1px solid ${T.tealBrd}`,
            background: T.tealGlow, color: T.teal, fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
          }}>Today</button>

          <button onClick={handleRefresh} disabled={refreshing} style={{
            width: 28, height: 28, borderRadius: 8, border: `1px solid rgba(0,0,0,0.08)`,
            background: 'transparent', color: T.textMuted, flexShrink: 0,
            cursor: refreshing ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: refreshing ? 0.5 : 1,
          }}>
            {refreshing ? '…' : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M4 4v5h5M20 20v-5h-5" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L4 10m16 4l-1.64 4.36A9 9 0 0 1 3.51 15" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>

        {view === 'day' && (
          <>
            <WeekStrip baseDate={weekStart} selected={selectedDate} onSelect={setSelectedDate} eventDates={eventDates} />
            <div style={{ padding: '4px 0 7px', fontSize: 12, fontWeight: 600, color: T.textSoft }}>
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-AU', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })}
              {selectedDate === todayStr && (
                <span style={{ marginLeft: 7, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, background: T.teal + '14', color: T.teal, letterSpacing: '0.08em' }}>Today</span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Content — fluid morph between views */}
      <div
        key={view}
        className="anim-morph"
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: T.bg }}
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          const order: ViewMode[] = ['day','week','month','year'];
          const idx = order.indexOf(view);
          if (idx === -1) return;
          if (e.deltaY > 0 && idx < order.length - 1) setView(order[idx + 1]);
          else if (e.deltaY < 0 && idx > 0) setView(order[idx - 1]);
        }}
      >
        {view === 'day' && <DayTimeline events={events} selectedDate={selectedDate} />}
        {view === 'week' && <WeekView events={events} weekStart={weekStart} onSelectDay={handleSelectDay} />}
        {view === 'month' && <MonthView events={events} baseDate={baseDate} selectedDate={selectedDate} onSelectDay={handleSelectDay} />}
        {view === 'year' && <YearView events={events} year={baseDate.getFullYear()} onSelectMonth={handleSelectMonth} />}
        {view === 'agenda' && <AgendaView events={events} fromDate={selectedDate} onSelectDay={handleSelectDay} />}
      </div>

      </div>{/* end calendar-right-panel */}
    </div>
  );
}
