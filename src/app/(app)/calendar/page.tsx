'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/PageHeader';
import { T, DEMO_WEEKLY, urgencyColors } from '@/lib/theme';

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  allDay: boolean;
  color: string | null;
  isDeadline?: boolean;
}

interface CanvasAssignment {
  name: string;
  course_name: string;
  due_at: string | null;
}

function groupEventsByDay(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  const groups: Record<string, CalendarEvent[]> = {};
  for (const ev of events) {
    const date = ev.start.split('T')[0];
    if (!groups[date]) groups[date] = [];
    groups[date].push(ev);
  }
  return groups;
}

function formatTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('en-AU', { timeZone: 'Australia/Melbourne', hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
}

function formatDayLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'long', day: 'numeric', month: 'short' });
  } catch {
    return dateStr;
  }
}

function getEventType(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('[ai]')) return 'ai';
  if (t.includes('gym')) return 'gym';
  if (t.includes('work')) return 'work';
  if (t.includes('lecture') || t.includes('tutorial') || t.includes('practical') || t.includes('lab')) return 'class';
  if (t.includes('lunch') || t.includes('break')) return 'break';
  return 'other';
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [useDemoData, setUseDemoData] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/calendar').then((r) => r.json()).catch(() => null),
      fetch('/api/canvas').then((r) => r.json()).catch(() => null),
    ]).then(([calData, canvasData]) => {
      const calEvents: CalendarEvent[] = calData?.events || [];

      // Merge Canvas assignment deadlines as calendar events
      if (canvasData?.data?.assignments) {
        for (const a of canvasData.data.assignments as CanvasAssignment[]) {
          if (a.due_at) {
            calEvents.push({
              id: `canvas-${a.name}`,
              title: `📕 ${a.name} (${a.course_name})`,
              description: 'Canvas assignment deadline',
              start: a.due_at,
              end: a.due_at,
              allDay: false,
              color: null,
              isDeadline: true,
            });
          }
        }
      }

      if (calEvents.length > 0) {
        setEvents(calEvents);
        setStale(calData?.stale || false);
      } else {
        setUseDemoData(true);
      }
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '0 18px' }}>
        <PageHeader title="Calendar" subtitle="Loading..." />
        <div style={{ textAlign: 'center', padding: 40, color: T.textMuted, fontSize: 12 }}>Fetching calendar events...</div>
      </div>
    );
  }

  if (useDemoData) {
    return (
      <div style={{ padding: '0 18px' }}>
        <PageHeader title="Calendar" subtitle="Week view + AI study blocks" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {DEMO_WEEKLY.map((d, i) => (
            <div key={i} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                {d.tag && <span style={{ fontSize: 8, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: T.teal + '12', color: T.teal, textTransform: 'uppercase' }}>{d.tag}</span>}
                {d.day}
              </div>
              {d.deadlines.map((dl, j) => (
                <div key={j} style={{ margin: '4px 0', padding: '6px 10px', background: T.red + '0c', borderLeft: `3px solid ${T.red}`, borderRadius: '0 6px 6px 0', fontSize: 10, color: T.red, fontWeight: 600 }}>{dl}</div>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {d.events.map((ev, j) => (
                  <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
                    <span style={{ fontSize: 10, color: T.textMuted, width: 56, fontVariantNumeric: 'tabular-nums' }}>{ev.t}</span>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: urgencyColors[ev.tp] || T.teal }} />
                    <span style={{ fontSize: 11, color: T.text }}>{ev.title}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, padding: '12px 16px', background: T.glass, borderRadius: 10, border: `1px solid ${T.glassBrd}`, fontSize: 11, color: T.textMuted, fontWeight: 300 }}>
          Demo data shown. Sign in with Google to see your real calendar.
        </div>
      </div>
    );
  }

  // Real calendar data
  const grouped = groupEventsByDay(events);
  const sortedDates = Object.keys(grouped).sort();

  return (
    <div style={{ padding: '0 18px' }}>
      <PageHeader title="Calendar" subtitle="Next 7 days from Google Calendar" />

      {stale && (
        <div style={{ marginBottom: 10, fontSize: 10, color: T.yellow, background: T.yellow + '10', padding: '6px 12px', borderRadius: 6, border: `1px solid ${T.yellow}20` }}>
          Using cached data — Google Calendar may be temporarily unavailable
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sortedDates.map((date) => {
          const dayEvents = grouped[date];
          const isToday = date === new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
          const isTomorrow = (() => {
            const tmrw = new Date();
            tmrw.setDate(tmrw.getDate() + 1);
            return date === tmrw.toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
          })();

          return (
            <div key={date} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                {isTomorrow && <span style={{ fontSize: 8, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: T.teal + '12', color: T.teal, textTransform: 'uppercase' }}>tomorrow</span>}
                {isToday && <span style={{ fontSize: 8, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: T.orange + '12', color: T.orange, textTransform: 'uppercase' }}>today</span>}
                {formatDayLabel(date)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {dayEvents.map((ev) => {
                  const evType = getEventType(ev.title);
                  const isDeadline = ev.isDeadline;
                  if (isDeadline) {
                    return (
                      <div key={ev.id} style={{
                        margin: '4px 0', padding: '6px 10px', background: T.red + '0c',
                        borderLeft: `3px solid ${T.red}`, borderRadius: '0 6px 6px 0',
                        fontSize: 10, color: T.red, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatTime(ev.start)}</span>
                        {ev.title}
                      </div>
                    );
                  }
                  return (
                    <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
                      <span style={{ fontSize: 10, color: T.textMuted, width: 70, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                        {ev.allDay ? 'All day' : formatTime(ev.start)}
                      </span>
                      <div style={{ width: 4, height: 4, borderRadius: '50%', background: urgencyColors[evType] || T.teal, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: T.text }}>{ev.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {sortedDates.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: T.textMuted, fontSize: 12 }}>
          No events in the next 7 days.
        </div>
      )}
    </div>
  );
}
