'use client';

import { useMemo } from 'react';
import { T } from '@/lib/theme';
import type { Task } from '@/lib/task-types';

interface Props {
  tasks: Task[];
}

function getWeekDays(): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

function getStreak(tasks: Task[]): number {
  const completedDates = new Set(
    tasks
      .filter(t => t.completed_at)
      .map(t => new Date(t.completed_at!).toISOString().split('T')[0])
  );
  let streak = 0;
  const d = new Date();
  while (true) {
    const ds = d.toISOString().split('T')[0];
    if (completedDates.has(ds)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export default function TaskStats({ tasks }: Props) {
  const weekDays = useMemo(() => getWeekDays(), []);

  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'done').length;
    const active = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length;
    const overdue = tasks.filter(t =>
      t.due_date && t.status !== 'done' && new Date(t.due_date + 'T23:59:59') < new Date()
    ).length;
    const streak = getStreak(tasks);
    const rate = total > 0 ? Math.round((done / total) * 100) : 0;

    const weekData = weekDays.map(day => ({
      day,
      label: new Date(day + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short' }),
      count: tasks.filter(t =>
        t.completed_at && new Date(t.completed_at).toISOString().split('T')[0] === day
      ).length,
    }));

    const maxWeek = Math.max(...weekData.map(d => d.count), 1);

    return { total, done, active, overdue, streak, rate, weekData, maxWeek };
  }, [tasks, weekDays]);

  const statCards: { label: string; value: string | number; color: string }[] = [
    { label: 'Active', value: stats.active, color: T.teal },
    { label: 'Done', value: stats.done, color: 'var(--green)' },
    { label: 'Overdue', value: stats.overdue, color: 'var(--red)' },
    { label: 'Streak', value: `${stats.streak}d`, color: 'var(--orange)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {statCards.map(s => (
          <div key={s.label} style={{
            padding: '12px', borderRadius: 12,
            background: 'var(--surface)', border: '1px solid var(--border)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, letterSpacing: '-0.03em' }}>{s.value}</div>
            <div style={{ fontSize: 9.5, fontWeight: 600, color: T.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Completion rate bar */}
      <div style={{
        padding: '12px 14px', borderRadius: 12,
        background: 'var(--surface)', border: '1px solid var(--border)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Completion Rate</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: T.teal }}>{stats.rate}%</span>
        </div>
        <div style={{
          height: 6, borderRadius: 3, background: 'var(--surface-hover)',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', borderRadius: 3,
            background: `linear-gradient(90deg, var(--teal-dk), var(--teal-lt))`,
            width: `${stats.rate}%`,
            transition: 'width 0.5s ease',
          }} />
        </div>
      </div>

      {/* Weekly chart */}
      <div style={{
        padding: '14px', borderRadius: 12,
        background: 'var(--surface)', border: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.text, display: 'block', marginBottom: 12 }}>
          This Week
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 80 }}>
          {stats.weekData.map(d => (
            <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: T.teal }}>{d.count || ''}</span>
              <div style={{
                width: '100%', borderRadius: 4,
                background: d.count > 0
                  ? `linear-gradient(to top, var(--teal-dk), var(--teal-lt))`
                  : 'var(--surface-hover)',
                height: d.count > 0 ? Math.max(8, (d.count / stats.maxWeek) * 60) : 8,
                transition: 'height 0.3s ease',
              }} />
              <span style={{
                fontSize: 9, fontWeight: 600, color: T.textFaint,
              }}>{d.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
