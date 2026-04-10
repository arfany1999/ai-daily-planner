'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/PageHeader';
import { T } from '@/lib/theme';

interface ProgressData {
  tasks_completed: number;
  tasks_planned: number;
  completion_rate: number;
  study_hours: number;
  assignments_progressed: number;
  streak: number;
  week_start: string;
  week_end: string;
  ai_reflection: string | null;
}

export default function ProgressPage() {
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/progress')
      .then((r) => r.json())
      .then((d) => {
        if (d.tasks_planned !== undefined) setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const stats = data ? [
    { label: 'Tasks completed', value: `${data.tasks_completed}/${data.tasks_planned}`, pct: data.completion_rate, color: T.teal },
    { label: 'Study hours', value: `${data.study_hours}h`, pct: Math.min(data.study_hours / 20 * 100, 100), color: T.green },
    { label: 'Assignments', value: `${data.assignments_progressed}`, pct: Math.min(data.assignments_progressed / 5 * 100, 100), color: T.blue },
    { label: 'Streak', value: `${data.streak} days`, pct: Math.min(data.streak / 7 * 100, 100), color: T.orange },
  ] : [
    { label: 'Tasks completed', value: '0/0', pct: 0, color: T.teal },
    { label: 'Study hours', value: '0h', pct: 0, color: T.green },
    { label: 'Assignments', value: '0', pct: 0, color: T.blue },
    { label: 'Streak', value: '0 days', pct: 0, color: T.orange },
  ];

  return (
    <div style={{ padding: '0 18px' }}>
      <PageHeader title="Progress" subtitle={data ? `${data.week_start} \u2013 ${data.week_end}` : 'This week'} />

      {loading && <div style={{ textAlign: 'center', padding: 20, color: T.textMuted, fontSize: 12 }}>Loading stats...</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        {stats.map((s) => (
          <div key={s.label} style={{
            background: T.card, border: `1px solid ${T.border}`, borderRadius: 12,
            padding: 16, textAlign: 'center',
          }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: T.text, marginBottom: 4 }}>{s.value}</div>
            <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 300, marginBottom: 8 }}>{s.label}</div>
            <div style={{ height: 4, background: T.bg3, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${s.pct}%`, background: s.color, borderRadius: 2, transition: 'width 0.5s' }} />
            </div>
          </div>
        ))}
      </div>

      {/* AI Reflection */}
      <div style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.teal, marginBottom: 10 }}>
          AI Reflection
        </div>
        <div style={{ fontSize: 13, color: T.text, lineHeight: 1.8, fontWeight: 300 }}>
          {data?.ai_reflection || (data
            ? `You completed ${data.tasks_completed} of ${data.tasks_planned} tasks this week (${data.completion_rate}%). ${data.streak > 0 ? `Current streak: ${data.streak} days!` : 'Start a streak by completing all tasks tomorrow.'} ${data.study_hours > 0 ? `Total study time: ${data.study_hours} hours.` : ''}`
            : 'AI weekly reflection generates on Sunday evening during the nightly run (Phase 9).'
          )}
        </div>
      </div>

      {/* Export link */}
      <a href="/api/export/tasks?format=csv" style={{
        display: 'block', marginTop: 12, textAlign: 'center',
        padding: '10px 0', background: T.glass, border: `1px solid ${T.glassBrd}`,
        borderRadius: 10, color: T.textSoft, fontSize: 11, fontWeight: 500, textDecoration: 'none',
      }}>
        Export task history (CSV)
      </a>
    </div>
  );
}
