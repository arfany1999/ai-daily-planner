'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/PageHeader';
import { T, DEMO_TODO, urgencyColors } from '@/lib/theme';

interface Task {
  id: string;
  start_time: string;
  end_time: string;
  task_name: string;
  description?: string;
  estimated_minutes: number;
  buffer_minutes: number;
  urgency: string;
  related_assignment?: string;
  carried_over?: boolean;
}

interface TodoData {
  timeline: Task[];
  pushed: { task_name: string; reason: string }[];
  summary?: string;
}

export default function TomorrowPage() {
  const [todo, setTodo] = useState<TodoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [tomorrowDate, setTomorrowDate] = useState('');

  // Demo fallback state
  const [demoDone, setDemoDone] = useState<Set<number>>(new Set());

  useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    setTomorrowDate(d.toLocaleDateString('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));

    fetch('/api/tomorrow')
      .then((r) => r.json())
      .then((d) => {
        if (d.todo?.timeline?.length > 0) {
          setTodo(d.todo);
          setStale(d.stale || false);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const r = await fetch('/api/tomorrow/refresh', { method: 'POST' });
      const d = await r.json();
      if (d.todo?.timeline?.length > 0) {
        setTodo(d.todo);
        setStale(false);
        setDone(new Set());
      }
    } catch { /* keep current */ }
    setRefreshing(false);
  };

  const completeTask = async (taskId: string) => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const date = d.toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });

    setDone((prev) => new Set([...prev, taskId]));
    await fetch('/api/tasks/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, date }),
    });
  };

  const pushTask = async (taskId: string) => {
    setDone((prev) => new Set([...prev, taskId]));
    await fetch('/api/tasks/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId }),
    });
  };

  // Real data view
  if (todo && todo.timeline.length > 0) {
    const isTask = (t: Task) => !['class', 'gym', 'work', 'break'].includes(t.urgency);

    return (
      <div style={{ padding: '0 18px' }}>
        <PageHeader title="Tomorrow" subtitle={tomorrowDate} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          {todo.summary && (
            <div style={{ fontSize: 11, color: T.textSoft, fontWeight: 300, flex: 1 }}>{todo.summary}</div>
          )}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 8 }}>
            {stale && (
              <span style={{ fontSize: 10, color: T.yellow, background: T.yellow + '10', padding: '4px 8px', borderRadius: 5 }}>Cached</span>
            )}
            <button onClick={handleRefresh} disabled={refreshing} style={{
              padding: '6px 14px', background: T.tealGlow, border: `1px solid ${T.tealBrd}`,
              borderRadius: 8, color: T.teal, fontSize: 10, fontWeight: 600, cursor: refreshing ? 'wait' : 'pointer',
              opacity: refreshing ? 0.5 : 1,
            }}>{refreshing ? 'Refreshing...' : 'Refresh'}</button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {todo.timeline.map((t) => {
            const d = done.has(t.id);
            const taskable = isTask(t);
            return (
              <div key={t.id} style={{ display: 'flex', gap: 8, opacity: d ? 0.3 : 1, transition: 'opacity 0.4s' }}>
                <div style={{ width: 50, flexShrink: 0, textAlign: 'right', paddingTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: T.textMuted, fontVariantNumeric: 'tabular-nums' }}>{t.start_time}</div>
                </div>
                <div style={{
                  flex: 1, background: T.card, border: `1px solid ${T.border}`,
                  borderLeft: `3px solid ${urgencyColors[t.urgency] || T.teal}`,
                  borderRadius: '0 10px 10px 0', padding: '10px 14px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      {taskable && (
                        <input type="checkbox" checked={d} onChange={() => completeTask(t.id)}
                          style={{ accentColor: T.teal, width: 15, height: 15, cursor: 'pointer' }} />
                      )}
                      {t.carried_over && (
                        <span style={{ fontSize: 8, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: T.orange + '15', color: T.orange }}>CARRIED</span>
                      )}
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.text, textDecoration: d ? 'line-through' : 'none' }}>{t.task_name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {t.buffer_minutes > 0 && (
                        <span style={{ fontSize: 9, color: T.textMuted, background: T.glass, padding: '2px 8px', borderRadius: 8, border: `1px solid ${T.glassBrd}`, fontVariantNumeric: 'tabular-nums' }}>
                          {t.estimated_minutes}+{t.buffer_minutes}m
                        </span>
                      )}
                      {taskable && !d && (
                        <button onClick={() => pushTask(t.id)} style={{
                          fontSize: 9, color: T.textMuted, background: 'transparent', border: `1px solid ${T.border}`,
                          borderRadius: 5, padding: '2px 6px', cursor: 'pointer',
                        }}>push</button>
                      )}
                    </div>
                  </div>
                  {t.description && (
                    <div style={{ fontSize: 11, color: T.textSoft, marginTop: 4, lineHeight: 1.6, fontWeight: 300 }}>{t.description}</div>
                  )}
                  {t.related_assignment && (
                    <div style={{ fontSize: 10, color: T.blue, marginTop: 3 }}>Related: {t.related_assignment}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Pushed tasks */}
        {todo.pushed && todo.pushed.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textMuted, marginBottom: 6 }}>Pushed to next day</div>
            {todo.pushed.map((p, i) => (
              <div key={i} style={{
                padding: '8px 12px', background: T.glass, border: `1px solid ${T.glassBrd}`,
                borderRadius: 8, marginBottom: 4, fontSize: 11, color: T.textSoft,
              }}>
                <span style={{ fontWeight: 500, color: T.text }}>{p.task_name}</span>
                {p.reason && <span style={{ color: T.textMuted }}> — {p.reason}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Completion counter */}
        {done.size > 0 && (
          <div style={{
            margin: '10px 0', padding: '10px 16px', background: T.tealGlow,
            borderRadius: 10, border: `1px solid ${T.tealBrd}`,
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: '50%',
              background: `linear-gradient(135deg,${T.tealDk},${T.teal})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, color: '#fff',
            }}>{'\u2713'}</div>
            <span style={{ fontSize: 12, fontWeight: 500, color: T.teal }}>{done.size} completed</span>
          </div>
        )}
      </div>
    );
  }

  // Demo fallback
  const toggleDemo = (i: number) => {
    const n = new Set(demoDone);
    if (n.has(i)) n.delete(i); else n.add(i);
    setDemoDone(n);
  };

  return (
    <div style={{ padding: '0 18px' }}>
      <PageHeader title="Tomorrow" subtitle={tomorrowDate || 'Loading...'} />
      {loading && <div style={{ textAlign: 'center', padding: 20, color: T.textMuted, fontSize: 12 }}>Loading...</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {DEMO_TODO.map((t, i) => {
          const d = demoDone.has(i);
          const isT = !['class', 'gym', 'work', 'break'].includes(t.urg);
          return (
            <div key={i} style={{ display: 'flex', gap: 8, opacity: d ? 0.3 : 1, transition: 'opacity 0.4s' }}>
              <div style={{ width: 50, flexShrink: 0, textAlign: 'right', paddingTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: T.textMuted, fontVariantNumeric: 'tabular-nums' }}>{t.time}</div>
              </div>
              <div style={{
                flex: 1, background: T.card, border: `1px solid ${T.border}`,
                borderLeft: `3px solid ${urgencyColors[t.urg] || T.teal}`,
                borderRadius: '0 10px 10px 0', padding: '10px 14px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    {isT && <input type="checkbox" checked={d} onChange={() => toggleDemo(i)} style={{ accentColor: T.teal, width: 15, height: 15, cursor: 'pointer' }} />}
                    {t.carried && <span style={{ fontSize: 8, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: T.orange + '15', color: T.orange }}>CARRIED</span>}
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.text, textDecoration: d ? 'line-through' : 'none' }}>{t.task}</span>
                  </div>
                  {t.buf > 0 && <span style={{ fontSize: 9, color: T.textMuted, background: T.glass, padding: '2px 8px', borderRadius: 8, border: `1px solid ${T.glassBrd}`, fontVariantNumeric: 'tabular-nums' }}>{t.est}+{t.buf}m</span>}
                </div>
                {t.desc && <div style={{ fontSize: 11, color: T.textSoft, marginTop: 4, lineHeight: 1.6, fontWeight: 300 }}>{t.desc}</div>}
              </div>
            </div>
          );
        })}
      </div>
      {demoDone.size > 0 && (
        <div style={{ margin: '10px 0', padding: '10px 16px', background: T.tealGlow, borderRadius: 10, border: `1px solid ${T.tealBrd}`, display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: `linear-gradient(135deg,${T.tealDk},${T.teal})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff' }}>{'\u2713'}</div>
          <span style={{ fontSize: 12, fontWeight: 500, color: T.teal }}>{demoDone.size} completed</span>
        </div>
      )}
      {!loading && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: T.glass, borderRadius: 10, border: `1px solid ${T.glassBrd}`, fontSize: 11, color: T.textMuted, fontWeight: 300 }}>
          Demo data shown. Sign in and connect your calendar for real AI-generated to-dos.
        </div>
      )}
    </div>
  );
}
