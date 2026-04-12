'use client';

import { useState, useEffect, useCallback } from 'react';
import PageHeader from '@/components/PageHeader';
import { T } from '@/lib/theme';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DayData {
  date: string;
  day: string;
  completed: number;
  planned: number;
  pct: number;
}

interface WeekTrend {
  week_start: string;
  label: string;
  pct: number;
  completed: number;
  planned: number;
}

interface TodayTask {
  id: string;
  label: string;
  time: string;
  urgency: string;
  completed: boolean;
}

interface Grade {
  id: string;
  course: string;
  assessment: string;
  grade: number;
  max_grade: number;
  weight: number;
}

interface Habit {
  id: string;
  name: string;
  emoji: string;
  color: string;
  target_days: number[];
}

interface ProgressData {
  tasks_completed: number;
  tasks_planned: number;
  completion_rate: number;
  study_hours: number;
  streak: number;
  week_start: string;
  week_end: string;
  ai_reflection: string | null;
  daily: DayData[];
  weekly_trend: WeekTrend[];
  today_tasks: TodayTask[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COURSES = [
  'Essentials of Pharmacy Practice (2610)',
  'Microbiology (AD) (2610)',
  'Molecular Biology and Genetics (2610)',
  'Professional Practice in Applied Science (2602)',
];

const EMPTY_GRADE = { course: '', assessment: '', grade: 0, max_grade: 100, weight: 25 };

// ── Helpers ───────────────────────────────────────────────────────────────────

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addWeeks(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n * 7);
  return localDateStr(d);
}

function getMondayOfToday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  now.setDate(now.getDate() - diff);
  return localDateStr(now);
}

function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(weekStart + 'T00:00:00');
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
  const yr = end.getFullYear();
  return `${fmt(start)} – ${fmt(end)}, ${yr}`;
}

function gradeBand(pct: number): string {
  if (pct >= 85) return 'HD (High Distinction)';
  if (pct >= 75) return 'D (Distinction)';
  if (pct >= 65) return 'C (Credit)';
  if (pct >= 50) return 'P (Pass)';
  return 'F (Fail)';
}

function gradeBandColor(pct: number): string {
  if (pct >= 85) return T.teal;
  if (pct >= 75) return T.green;
  if (pct >= 65) return T.blue;
  if (pct >= 50) return T.orange;
  return T.red;
}

function calcWeightedAvg(grades: Grade[]): number | null {
  const totalWeight = grades.reduce((s, g) => s + g.weight, 0);
  if (totalWeight === 0) return null;
  const weighted = grades.reduce((s, g) => s + (g.grade / g.max_grade) * g.weight, 0);
  return Math.round((weighted / totalWeight) * 1000) / 10;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
      color: T.teal, marginBottom: 12, marginTop: 4,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <div style={{ flex: 1, height: 1, background: T.tealBrd }} />
      {children}
      <div style={{ flex: 1, height: 1, background: T.tealBrd }} />
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: 14,
      padding: 16, ...style,
    }}>
      {children}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ProgressPage() {
  const [data, setData] = useState<ProgressData | null>(null);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAddGrade, setShowAddGrade] = useState(false);
  const [newGrade, setNewGrade] = useState({ ...EMPTY_GRADE });
  const [savingGrade, setSavingGrade] = useState(false);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitCompletions, setHabitCompletions] = useState<Record<string, boolean>>({});
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [newHabit, setNewHabit] = useState({ name: '', emoji: '✅', color: '#4a6ef5' });
  const [savingHabit, setSavingHabit] = useState(false);

  const baseMonday = getMondayOfToday();
  const weekStart = addWeeks(baseMonday, weekOffset);

  const fetchProgress = useCallback(() => {
    setLoading(true);
    fetch(`/api/progress?week_start=${weekStart}`)
      .then((r) => r.json())
      .then((d: ProgressData) => {
        if (d.tasks_planned !== undefined) setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [weekStart]);

  const fetchGrades = useCallback(() => {
    fetch('/api/progress/grades')
      .then((r) => r.json())
      .then((d: { grades: Grade[] }) => setGrades(d.grades || []))
      .catch(() => {});
  }, []);

  const fetchHabits = useCallback(() => {
    const todayStr = new Date().toLocaleDateString('en-CA');
    Promise.all([
      fetch('/api/habits').then(r => r.json()),
      fetch(`/api/habits/complete?date=${todayStr}`).then(r => r.json()),
    ]).then(([hd, cd]: [{ habits?: Habit[] }, { completions?: Record<string, boolean> }]) => {
      setHabits(hd.habits || []);
      setHabitCompletions(cd.completions || {});
    }).catch(() => {});
  }, []);

  useEffect(() => { fetchProgress(); }, [fetchProgress]);
  useEffect(() => { fetchGrades(); }, [fetchGrades]);
  useEffect(() => { fetchHabits(); }, [fetchHabits]);

  const handleAddGrade = async () => {
    if (!newGrade.course || !newGrade.assessment) return;
    setSavingGrade(true);
    try {
      const res = await fetch('/api/progress/grades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newGrade),
      });
      const d = await res.json() as { grades: Grade[] };
      setGrades(d.grades || []);
      setNewGrade({ ...EMPTY_GRADE });
      setShowAddGrade(false);
    } finally {
      setSavingGrade(false);
    }
  };

  const handleDeleteGrade = async (id: string) => {
    try {
      const res = await fetch('/api/progress/grades', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const d = await res.json() as { grades: Grade[] };
      setGrades(d.grades || []);
    } catch { /* ignore */ }
  };

  const toggleHabit = async (habitId: string) => {
    const todayStr = new Date().toLocaleDateString('en-CA');
    const newVal = !habitCompletions[habitId];
    setHabitCompletions(prev => ({ ...prev, [habitId]: newVal }));
    await fetch('/api/habits/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ habit_id: habitId, date: todayStr, completed: newVal }),
    }).catch(() => {});
  };

  const handleAddHabit = async () => {
    if (!newHabit.name.trim()) return;
    setSavingHabit(true);
    try {
      const res = await fetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newHabit),
      });
      const d = await res.json() as { habits: Habit[] };
      setHabits(d.habits || []);
      setNewHabit({ name: '', emoji: '✅', color: '#4a6ef5' });
      setShowAddHabit(false);
    } finally {
      setSavingHabit(false);
    }
  };

  const handleDeleteHabit = async (id: string) => {
    const res = await fetch('/api/habits', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const d = await res.json() as { habits: Habit[] };
    setHabits(d.habits || []);
  };

  const weightedAvg = calcWeightedAvg(grades);
  const isCurrentWeek = weekOffset === 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '0 16px 32px' }}>
      <PageHeader title="Progress" subtitle={formatWeekRange(weekStart)} />

      {/* ── Week navigation ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16, gap: 8,
      }}>
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
          style={{
            background: T.glass, border: `1px solid ${T.glassBrd}`, borderRadius: 8,
            padding: '6px 14px', fontSize: 12, color: T.textSoft, cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          ← Prev
        </button>
        <span style={{ fontSize: 12, color: T.textMuted, fontWeight: 500, textAlign: 'center' }}>
          Week of {formatWeekRange(weekStart)}
        </span>
        <button
          onClick={() => setWeekOffset((w) => Math.min(w + 1, 0))}
          disabled={isCurrentWeek}
          style={{
            background: T.glass, border: `1px solid ${T.glassBrd}`, borderRadius: 8,
            padding: '6px 14px', fontSize: 12, color: isCurrentWeek ? T.textMuted : T.textSoft,
            cursor: isCurrentWeek ? 'default' : 'pointer', fontWeight: 500,
            opacity: isCurrentWeek ? 0.4 : 1,
          }}
        >
          Next →
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 24, color: T.textMuted, fontSize: 12 }}>
          Loading stats...
        </div>
      )}

      {/* ── Summary chips ── */}
      {data && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <Chip icon="🔥" label={`Streak: ${data.streak} day${data.streak !== 1 ? 's' : ''}`} color={T.orange} />
          <Chip icon="✓" label={`${data.tasks_completed}/${data.tasks_planned} (${data.completion_rate}%)`} color={T.green} />
          <Chip icon="📚" label={`${data.study_hours}h`} color={T.teal} />
          <Chip icon="📋" label={`${grades.length} grade${grades.length !== 1 ? 's' : ''}`} color={T.purple} />
        </div>
      )}

      {/* ── This Week ── */}
      <SectionTitle>This Week</SectionTitle>
      <Card style={{ marginBottom: 20 }}>
        {data?.daily && data.daily.length > 0 ? (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
            {data.daily.map((d) => {
              const barColor = d.planned === 0 ? T.border
                : d.pct === 100 ? T.green
                : d.pct > 0 ? T.orange
                : `${T.red}55`;
              const barH = d.planned === 0 ? 4 : Math.max(4, Math.round((d.pct / 100) * 60));
              return (
                <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ fontSize: 9, color: T.textMuted, fontWeight: 600 }}>{d.day}</div>
                  {/* Bar container */}
                  <div style={{
                    width: '100%', height: 60, display: 'flex', flexDirection: 'column',
                    justifyContent: 'flex-end', alignItems: 'center',
                  }}>
                    <div style={{
                      width: '70%', height: barH,
                      background: barColor, borderRadius: 3,
                      transition: 'height 0.4s ease',
                    }} />
                  </div>
                  <div style={{ fontSize: 9, color: T.text, fontWeight: 600, textAlign: 'center' }}>
                    {d.planned === 0 ? '—' : `${d.completed}/${d.planned}`}
                  </div>
                  {d.planned > 0 && (
                    <div style={{ fontSize: 9, color: d.pct === 100 ? T.green : T.textMuted }}>
                      {d.pct}%
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: T.textMuted, fontSize: 12, padding: 12 }}>
            No data for this week
          </div>
        )}
      </Card>

      {/* ── Today's Tasks (only shown for current week) ── */}
      {isCurrentWeek && (
        <>
          <SectionTitle>Today&apos;s Tasks</SectionTitle>
          <Card style={{ marginBottom: 20 }}>
            {data?.today_tasks && data.today_tasks.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.today_tasks.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      opacity: t.completed ? 1 : 0.6,
                    }}
                  >
                    <span style={{
                      fontSize: 14, color: t.completed ? T.green : T.red,
                      fontWeight: 700, width: 16, textAlign: 'center', flexShrink: 0,
                    }}>
                      {t.completed ? '✓' : '✗'}
                    </span>
                    <span style={{ fontSize: 11, color: T.textMuted, width: 40, flexShrink: 0 }}>
                      {t.time}
                    </span>
                    <span style={{
                      fontSize: 13, color: t.completed ? T.text : T.textSoft,
                      flex: 1, textDecoration: t.completed ? 'none' : undefined,
                    }}>
                      {t.label}
                    </span>
                    <span style={{
                      fontSize: 9, color: T.textMuted, background: T.bg3,
                      borderRadius: 4, padding: '2px 6px', flexShrink: 0,
                    }}>
                      {t.urgency}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: T.textMuted, fontSize: 12, padding: 8 }}>
                No tasks planned today
              </div>
            )}
          </Card>
        </>
      )}

      {/* ── 4-Week Trend ── */}
      <SectionTitle>4-Week Trend</SectionTitle>
      <Card style={{ marginBottom: 20 }}>
        {data?.weekly_trend && data.weekly_trend.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...data.weekly_trend].reverse().map((wt, i) => {
              const isThis = i === 0;
              const barColor = wt.pct >= 100 ? T.green
                : wt.pct >= 70 ? T.teal
                : wt.pct >= 40 ? T.orange
                : T.red;
              return (
                <div key={wt.week_start} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 70, fontSize: 10, color: isThis ? T.teal : T.textMuted,
                    fontWeight: isThis ? 700 : 400, flexShrink: 0,
                  }}>
                    {isThis ? 'This week' : wt.label}
                  </div>
                  <div style={{
                    flex: 1, height: 12, background: T.bg3, borderRadius: 6, overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%', width: `${wt.pct}%`, background: barColor,
                      borderRadius: 6, transition: 'width 0.5s ease',
                      maxWidth: '100%',
                    }} />
                  </div>
                  <div style={{ width: 36, fontSize: 11, color: T.text, fontWeight: 600, textAlign: 'right' }}>
                    {wt.pct}%
                  </div>
                  <div style={{ width: 40, fontSize: 10, color: T.textMuted, textAlign: 'right' }}>
                    {wt.completed}/{wt.planned}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: T.textMuted, fontSize: 12 }}>No trend data yet</div>
        )}
      </Card>

      {/* ── Habit Tracker ── */}
      {isCurrentWeek && (
        <>
          <SectionTitle>Habit Tracker</SectionTitle>
          <Card style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: T.textMuted }}>Daily habits · {Object.values(habitCompletions).filter(Boolean).length}/{habits.length} today</span>
              <button onClick={() => setShowAddHabit(v => !v)} style={{
                background: T.tealGlow, border: `1px solid ${T.tealBrd}`, borderRadius: 8,
                padding: '5px 12px', fontSize: 11, color: T.teal, cursor: 'pointer', fontWeight: 600,
              }}>{showAddHabit ? '✕ Cancel' : '+ Add Habit'}</button>
            </div>

            {showAddHabit && (
              <div style={{ background: T.bg3, borderRadius: 10, padding: 14, marginBottom: 14, border: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Emoji"
                    value={newHabit.emoji}
                    onChange={e => setNewHabit(h => ({ ...h, emoji: e.target.value }))}
                    style={{ width: 52, padding: '7px 8px', borderRadius: 7, fontSize: 18, background: T.card, border: `1px solid ${T.border}`, color: T.text, textAlign: 'center' }}
                  />
                  <input
                    type="text"
                    placeholder="Habit name…"
                    value={newHabit.name}
                    onChange={e => setNewHabit(h => ({ ...h, name: e.target.value }))}
                    style={{ flex: 1, padding: '7px 10px', borderRadius: 7, fontSize: 12, background: T.card, border: `1px solid ${T.border}`, color: T.text, boxSizing: 'border-box' as const }}
                  />
                  <input
                    type="color"
                    value={newHabit.color}
                    onChange={e => setNewHabit(h => ({ ...h, color: e.target.value }))}
                    style={{ width: 36, height: 36, borderRadius: 7, border: `1px solid ${T.border}`, cursor: 'pointer', padding: 2 }}
                  />
                </div>
                <button onClick={handleAddHabit} disabled={savingHabit || !newHabit.name.trim()} style={{
                  background: T.teal, border: 'none', borderRadius: 8, padding: '8px 0', fontSize: 12, color: '#fff', fontWeight: 600,
                  cursor: savingHabit || !newHabit.name.trim() ? 'not-allowed' : 'pointer',
                  opacity: savingHabit || !newHabit.name.trim() ? 0.5 : 1,
                }}>{savingHabit ? 'Saving…' : 'Add Habit'}</button>
              </div>
            )}

            {habits.length === 0 ? (
              <div style={{ textAlign: 'center', color: T.textMuted, fontSize: 12, padding: '8px 0' }}>
                No habits yet — tap &ldquo;+ Add Habit&rdquo; to get started
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {habits.map(h => {
                  const done = habitCompletions[h.id] === true;
                  return (
                    <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button onClick={() => toggleHabit(h.id)} style={{
                        width: 32, height: 32, borderRadius: 10, border: `2px solid ${done ? h.color : T.border}`,
                        background: done ? h.color : 'transparent', cursor: 'pointer', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: done ? 14 : 16,
                        transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
                      }}>
                        {done ? '✓' : h.emoji}
                      </button>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: done ? T.textMuted : T.text, textDecoration: done ? 'line-through' : 'none' }}>{h.name}</div>
                      </div>
                      <button onClick={() => handleDeleteHabit(h.id)} style={{
                        background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, fontSize: 13, padding: 0,
                      }}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}

      {/* ── Grade Tracker ── */}
      <SectionTitle>Grade Tracker</SectionTitle>
      <Card style={{ marginBottom: 20 }}>
        {/* Add grade button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 400 }}>
            Track your assessment grades
          </span>
          <button
            onClick={() => setShowAddGrade((v) => !v)}
            style={{
              background: T.tealGlow, border: `1px solid ${T.tealBrd}`, borderRadius: 8,
              padding: '5px 12px', fontSize: 11, color: T.teal, cursor: 'pointer', fontWeight: 600,
            }}
          >
            {showAddGrade ? '✕ Cancel' : '+ Add Grade'}
          </button>
        </div>

        {/* Add grade form */}
        {showAddGrade && (
          <div style={{
            background: T.bg3, borderRadius: 10, padding: 14, marginBottom: 14,
            border: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div>
              <label style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                COURSE
              </label>
              <select
                value={newGrade.course}
                onChange={(e) => setNewGrade((g) => ({ ...g, course: e.target.value }))}
                style={{
                  width: '100%', padding: '7px 10px', borderRadius: 7, fontSize: 12,
                  background: T.card, border: `1px solid ${T.border}`, color: T.text,
                }}
              >
                <option value="">Select course...</option>
                {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                ASSESSMENT
              </label>
              <input
                type="text"
                placeholder="e.g. Test 1, Lab Report 2"
                value={newGrade.assessment}
                onChange={(e) => setNewGrade((g) => ({ ...g, assessment: e.target.value }))}
                style={{
                  width: '100%', padding: '7px 10px', borderRadius: 7, fontSize: 12,
                  background: T.card, border: `1px solid ${T.border}`, color: T.text,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  GRADE
                </label>
                <input
                  type="number"
                  min={0}
                  max={newGrade.max_grade}
                  value={newGrade.grade}
                  onChange={(e) => setNewGrade((g) => ({ ...g, grade: Number(e.target.value) }))}
                  style={{
                    width: '100%', padding: '7px 10px', borderRadius: 7, fontSize: 12,
                    background: T.card, border: `1px solid ${T.border}`, color: T.text,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  OUT OF
                </label>
                <input
                  type="number"
                  min={1}
                  value={newGrade.max_grade}
                  onChange={(e) => setNewGrade((g) => ({ ...g, max_grade: Number(e.target.value) }))}
                  style={{
                    width: '100%', padding: '7px 10px', borderRadius: 7, fontSize: 12,
                    background: T.card, border: `1px solid ${T.border}`, color: T.text,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  WEIGHT %
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={newGrade.weight}
                  onChange={(e) => setNewGrade((g) => ({ ...g, weight: Number(e.target.value) }))}
                  style={{
                    width: '100%', padding: '7px 10px', borderRadius: 7, fontSize: 12,
                    background: T.card, border: `1px solid ${T.border}`, color: T.text,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
            <button
              onClick={handleAddGrade}
              disabled={savingGrade || !newGrade.course || !newGrade.assessment}
              style={{
                background: T.teal, border: 'none', borderRadius: 8,
                padding: '8px 0', fontSize: 12, color: '#fff', fontWeight: 600,
                cursor: savingGrade || !newGrade.course || !newGrade.assessment ? 'not-allowed' : 'pointer',
                opacity: savingGrade || !newGrade.course || !newGrade.assessment ? 0.5 : 1,
              }}
            >
              {savingGrade ? 'Saving...' : 'Save Grade'}
            </button>
          </div>
        )}

        {/* Grade list */}
        {grades.length > 0 ? (
          <>
            {/* Header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '2fr 1.2fr 60px 48px 24px',
              gap: 6, padding: '4px 0', borderBottom: `1px solid ${T.border}`, marginBottom: 6,
            }}>
              {['Course', 'Assessment', 'Grade', 'Wt', ''].map((h) => (
                <div key={h} style={{ fontSize: 9, color: T.textMuted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {h}
                </div>
              ))}
            </div>
            {grades.map((g) => {
              const pct = Math.round((g.grade / g.max_grade) * 1000) / 10;
              const col = gradeBandColor(pct);
              return (
                <div key={g.id} style={{
                  display: 'grid', gridTemplateColumns: '2fr 1.2fr 60px 48px 24px',
                  gap: 6, padding: '6px 0', borderBottom: `1px solid ${T.border}`,
                  alignItems: 'center',
                }}>
                  <div style={{ fontSize: 11, color: T.text, lineHeight: 1.3 }}>{g.course}</div>
                  <div style={{ fontSize: 11, color: T.textSoft }}>{g.assessment}</div>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: col }}>{g.grade}/{g.max_grade}</span>
                    <span style={{ fontSize: 9, color: T.textMuted }}> ({pct}%)</span>
                  </div>
                  <div style={{ fontSize: 11, color: T.textMuted }}>{g.weight}%</div>
                  <button
                    onClick={() => handleDeleteGrade(g.id)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: T.textMuted, fontSize: 13, padding: 0, lineHeight: 1,
                    }}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              );
            })}

            {/* Weighted average */}
            {weightedAvg !== null && (
              <div style={{
                marginTop: 12, padding: '10px 12px',
                background: T.tealGlow, border: `1px solid ${T.tealBrd}`,
                borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 12, color: T.textSoft, fontWeight: 500 }}>Weighted Average</span>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: gradeBandColor(weightedAvg) }}>
                    {weightedAvg}%
                  </span>
                  <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 6 }}>
                    → {gradeBand(weightedAvg)}
                  </span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', color: T.textMuted, fontSize: 12, padding: '8px 0' }}>
            No grades yet — tap &ldquo;+ Add Grade&rdquo; to get started
          </div>
        )}
      </Card>

      {/* ── AI Reflection ── */}
      <SectionTitle>AI Reflection</SectionTitle>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: T.text, lineHeight: 1.8, fontWeight: 300 }}>
          {data?.ai_reflection || (data
            ? `You completed ${data.tasks_completed} of ${data.tasks_planned} tasks this week (${data.completion_rate}%). ${data.streak > 0 ? `Current streak: ${data.streak} day${data.streak !== 1 ? 's' : ''}! 🔥` : 'Start a streak by completing all tasks today.'} ${data.study_hours > 0 ? `Total study time: ${data.study_hours} hours.` : ''}`
            : 'AI weekly reflection generates on Sunday evening during the nightly run.'
          )}
        </div>
        {data && data.streak === 0 && (
          <div style={{ marginTop: 10, fontSize: 11, color: T.textMuted, fontStyle: 'italic' }}>
            🔥 Your streak resets at midnight if you miss all tasks
          </div>
        )}
      </Card>

      {/* ── Export ── */}
      <a href="/api/export/tasks?format=csv" style={{
        display: 'block', textAlign: 'center',
        padding: '10px 0', background: T.glass, border: `1px solid ${T.glassBrd}`,
        borderRadius: 10, color: T.textSoft, fontSize: 11, fontWeight: 500, textDecoration: 'none',
      }}>
        Export task history (CSV)
      </a>
    </div>
  );
}

// ── Chip ──────────────────────────────────────────────────────────────────────

function Chip({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      background: T.glass, border: `1px solid ${T.glassBrd}`,
      borderRadius: 20, padding: '5px 10px',
    }}>
      <span style={{ fontSize: 12 }}>{icon}</span>
      <span style={{ fontSize: 11, color, fontWeight: 600 }}>{label}</span>
    </div>
  );
}
