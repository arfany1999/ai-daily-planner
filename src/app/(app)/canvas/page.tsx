'use client';

import { useState, useEffect } from 'react';
import { T } from '@/lib/theme';

interface Assignment {
  id: number;
  name: string;
  course_name: string;
  due_at: string | null;
  has_submitted_submissions: boolean;
  points_possible?: number;
  submission_types?: string[];
  html_url?: string;
}

interface Announcement {
  id: number;
  title: string;
  message: string;
  posted_at: string;
  course_name: string;
  author: { display_name: string };
}

interface Quiz {
  id: number;
  title: string;
  course_name: string;
  due_at: string | null;
  lock_at: string | null;
  points_possible?: number;
  question_count?: number;
  time_limit?: number | null;
  quiz_type?: string;
  html_url?: string;
  published?: boolean;
}

interface CEvent {
  id: number;
  title: string;
  start_at: string | null;
  end_at: string | null;
  course_name: string;
  location_name?: string | null;
  description?: string;
  url?: string;
}

interface Course {
  id: number;
  name: string;
  course_code: string;
}

interface CanvasData {
  courses: Course[];
  assignments: Assignment[];
  announcements: Announcement[];
  quizzes?: Quiz[];
  events?: CEvent[];
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    timeZone: 'Australia/Melbourne', weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim().slice(0, 220);
}

// Fix known Canvas typos & normalise capitalisation
function fixName(name: string): string {
  return name
    .replace(/Pharmacutical/gi, 'Pharmaceutical')
    .replace(/pharmacutical/gi, 'pharmaceutical');
}

// Short display code for a course name
function courseCode(name: string): string {
  // Use first meaningful words / acronym
  const stop = new Set(['and', 'the', 'of', 'in', 'for', 'a', 'an', 'to']);
  const words = name.split(/\s+/).filter(w => !stop.has(w.toLowerCase()));
  if (words.length <= 2) return words.map(w => w.slice(0, 4)).join('').toUpperCase();
  return words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
}

// Commander urgency config
function urgencyConfig(days: number): { color: string; label: string; bg: string } {
  if (days <= 2)  return { color: '#D50000', label: days === 0 ? 'TODAY' : days === 1 ? 'TOMORROW' : `${days}d`, bg: '#D5000012' };
  if (days <= 6)  return { color: '#F4511E', label: `${days}d`, bg: '#F4511E10' };
  if (days <= 13) return { color: '#F6BF26', label: `${days}d`, bg: '#F6BF2610' };
  return           { color: '#0B8043', label: `${days}d`, bg: '#0B804310' };
}

// Commander prep plan based on assignment type + days left
function prepPlan(name: string, days: number, submitted: boolean): string | null {
  if (submitted) return null;
  const n = name.toLowerCase();
  const isTest     = n.includes('test') || n.includes('exam') || n.includes('quiz') || n.includes('invigilated');
  const isReport   = n.includes('report') || n.includes('lab') || n.includes('write') || n.includes('essay');
  const isProject  = n.includes('project') || n.includes('assignment') || n.includes('portfolio');

  if (days <= 1) {
    if (isTest)    return '🚨 Final cram — review summary notes, key formulas, past papers tonight.';
    if (isReport)  return '🚨 Due very soon — finalise and proofread now. Submit early.';
    return '🚨 Due very soon — complete and submit today.';
  }
  if (days <= 3) {
    if (isTest)    return '⚡ 3-day sprint: Day 1 = notes review, Day 2 = practice questions, Day 3 = past papers.';
    if (isReport)  return '⚡ Draft tonight, review tomorrow, polish and submit day 3.';
    return '⚡ Start now — break into parts. Aim to finish by tomorrow.';
  }
  if (days <= 7) {
    if (isTest)    return `📅 ${days} days out — start with topic summaries. Aim for 90min focused blocks daily.`;
    if (isReport)  return `📅 ${days} days — outline today, draft sections over next 3 days, editing last 2.`;
    if (isProject) return `📅 ${days} days — split into milestones. Start the hardest part first.`;
    return `📅 ${days} days out — add a study block this week to make progress.`;
  }
  if (days <= 14) {
    if (isTest)    return `📖 ${days} days — no rush yet but start compiling notes. 1 topic per day.`;
    return `📖 ${days} days — on your radar. Schedule a prep block in the next 3–4 days.`;
  }
  return `✅ ${days} days away — bookmark it. Review specs when you have 10 min.`;
}

// COURSE COLOR PALETTE
const COURSE_COLORS = ['#4a6ef5', '#039BE5', '#8E24AA', '#0B8043', '#E67C73', '#F4511E'];

export default function CanvasPage() {
  const [data, setData] = useState<CanvasData | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [showCompleted, setShowCompleted] = useState<Record<string, boolean>>({});
  const [tokenInput, setTokenInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [tokenError, setTokenError] = useState('');

  useEffect(() => {
    fetch('/api/canvas')
      .then((r) => r.json())
      .then((d) => {
        setConnected(d.connected !== false);
        if (d.data) { setData(d.data); setStale(d.stale || false); }
        setLoading(false);
      })
      .catch(() => { setConnected(false); setLoading(false); });
  }, []);

  const saveToken = async () => {
    setSaving(true); setTokenError('');
    try {
      const r = await fetch('/api/settings/canvas-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput }),
      });
      const d = await r.json();
      if (d.success) {
        setTokenInput('');
        const canvasRes = await fetch('/api/canvas');
        const canvasData = await canvasRes.json();
        setConnected(true);
        if (canvasData.data) setData(canvasData.data);
      } else { setTokenError(d.error || 'Failed'); }
    } catch { setTokenError('Network error'); }
    setSaving(false);
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: '22px 18px' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 4 }}>Canvas</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ height: 80, borderRadius: 14, background: 'transparent', animation: 'fadeIn 0.5s ease both' }} />
          ))}
        </div>
      </div>
    );
  }

  // ── Connected but cache still warming up (first sync after connect) ──────
  if (connected === true && !data) {
    return (
      <div style={{ padding: '22px 18px' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 14 }}>Canvas</div>
        <div style={{ padding: '24px 16px', textAlign: 'center', color: T.textMuted, fontSize: 13, border: '1px dashed var(--border)', borderRadius: 14 }}>
          Syncing with RMIT Canvas… This usually takes a few seconds.
        </div>
      </div>
    );
  }

  // ── Not connected ──────────────────────────────────────────────────────────
  if (connected === false || !data) {
    return (
      <div style={{ padding: '22px 18px' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 4 }}>Canvas</div>
        <div style={{
          background: 'transparent', 
          border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20,
          padding: 28, textAlign: 'center',
        }}>
          <div style={{ fontSize: 38, marginBottom: 14 }}>🎓</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.text, marginBottom: 8 }}>Connect RMIT Canvas</div>
          <div style={{ fontSize: 12, color: T.textSoft, lineHeight: 1.7, marginBottom: 20, maxWidth: 280, margin: '0 auto 20px' }}>
            Go to rmit.instructure.com → Account → Settings → New Access Token
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={tokenInput} onChange={e => setTokenInput(e.target.value)}
              type="password" placeholder="Paste Canvas API token..."
              style={{ flex: 1, padding: '11px 14px', background: 'transparent', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, color: T.text, fontSize: 12, outline: 'none' }}
            />
            <button onClick={saveToken} disabled={saving || !tokenInput.trim()} style={{
              padding: '11px 18px', background: tokenInput.trim() ? `linear-gradient(135deg,${T.tealDk},${T.teal})` : 'rgba(0,0,0,0.07)',
              color: tokenInput.trim() ? '#fff' : T.textMuted, border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: tokenInput.trim() ? 'pointer' : 'default',
            }}>{saving ? 'Checking…' : 'Connect'}</button>
          </div>
          {tokenError && <div style={{ marginTop: 10, fontSize: 11, color: T.red }}>{tokenError}</div>}
        </div>
      </div>
    );
  }

  // ── Build per-course data ──────────────────────────────────────────────────
  const courses = data.courses;
  const quizzes = data.quizzes || [];
  const events = data.events || [];

  // Assign a color per course
  const courseColorMap: Record<string, string> = {};
  courses.forEach((c, i) => { courseColorMap[c.name] = COURSE_COLORS[i % COURSE_COLORS.length]; });

  // Merge assignments + quizzes into a unified stream so nothing is missed
  // (quizzes often ARE assignments in Canvas but sometimes stand alone).
  // Keep the richest record per (course, title) — prefer assignment version
  // since it has submission state.
  const quizAsAssignment: Assignment[] = quizzes.map(q => ({
    id: q.id + 1_000_000_000, // disambiguate namespace
    name: q.title,
    course_name: q.course_name,
    due_at: q.due_at,
    has_submitted_submissions: false, // Canvas quiz API doesn't return this here
    points_possible: q.points_possible,
    submission_types: ['online_quiz'],
    html_url: q.html_url,
  }));
  // Dedupe: a Canvas quiz linked to an assignment shows up in both endpoints
  const aKeys = new Set(data.assignments.map(a => `${a.course_name}::${a.name}`));
  const uniqueQuizEntries = quizAsAssignment.filter(q => !aKeys.has(`${q.course_name}::${q.name}`));
  const allItems = [...data.assignments, ...uniqueQuizEntries];

  // For "All" tab: pending across all courses sorted by urgency
  const allPending = allItems
    .filter(a => a.due_at && daysUntil(a.due_at) >= 0 && !a.has_submitted_submissions)
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());

  const allSubmitted = allItems
    .filter(a => a.has_submitted_submissions)
    .sort((a, b) => (a.due_at && b.due_at) ? new Date(b.due_at).getTime() - new Date(a.due_at).getTime() : 0);

  const allOverdue = allItems
    .filter(a => a.due_at && daysUntil(a.due_at) < 0 && !a.has_submitted_submissions);

  // NEW: Undated — assignments with no due_at, not submitted (ongoing / self-paced)
  const allUndated = allItems
    .filter(a => !a.due_at && !a.has_submitted_submissions);

  // Tabs: "All" + one per course (course_code label, e.g. BIOL2468) + Announcements
  const tabs: { key: string; label: string; color?: string }[] = [
    { key: 'all', label: 'All' },
    ...courses.map((c, i) => ({
      key: c.name,
      label: (c.course_code || courseCode(c.name)).toUpperCase(),
      color: COURSE_COLORS[i % COURSE_COLORS.length],
    })),
    { key: 'announcements', label: 'News' },
  ];

  const activeCourse = activeTab !== 'all' && activeTab !== 'announcements' ? courses.find(c => c.name === activeTab) : null;

  const visiblePending = activeCourse ? allPending.filter(a => a.course_name === activeTab) : allPending;
  const visibleSubmitted = activeCourse ? allSubmitted.filter(a => a.course_name === activeTab) : allSubmitted;
  const visibleOverdue = activeCourse ? allOverdue.filter(a => a.course_name === activeTab) : allOverdue;
  const visibleUndated = activeCourse ? allUndated.filter(a => a.course_name === activeTab) : allUndated;

  // Upcoming Canvas-scheduled events (lectures, labs, etc — the ones on Canvas calendar)
  const upcomingEvents = events
    .filter(e => e.start_at && new Date(e.start_at).getTime() > Date.now())
    .sort((a, b) => new Date(a.start_at!).getTime() - new Date(b.start_at!).getTime())
    .slice(0, activeCourse ? 12 : 6);
  const visibleEvents = activeCourse ? upcomingEvents.filter(e => e.course_name === activeTab) : upcomingEvents;

  const visibleAnnouncements = (activeCourse
    ? data.announcements.filter(a => a.course_name === activeTab)
    : data.announcements
  ).sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime());

  const completedKey = activeTab;
  const showCompletedForTab = showCompleted[completedKey] ?? false;

  return (
    <div style={{ padding: '22px 18px 80px' }}>

      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: T.text, letterSpacing: '-0.5px' }}>Canvas</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
              {courses.length} courses · {allPending.length} pending · {allOverdue.length} overdue · {allUndated.length} undated · {allSubmitted.length} done
              {stale && <span style={{ marginLeft: 8, color: T.yellow }}>cached</span>}
            </div>
          </div>
          {/* Urgency summary */}
          {allPending.length > 0 && (() => {
            const next = allPending[0];
            const days = daysUntil(next.due_at!);
            const urg = urgencyConfig(days);
            return (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: urg.color, letterSpacing: '0.08em' }}>Next due</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: urg.color }}>{urg.label}</div>
                <div style={{ fontSize: 10, color: T.textMuted, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fixName(next.name)}</div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Course tabs */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 16 }}>
        {tabs.map(t => {
          const isActive = activeTab === t.key;
          const color = t.color || T.teal;
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
              flexShrink: 0,
              padding: '7px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: isActive ? color : 'var(--surface)',
              color: isActive ? '#fff' : T.textMuted,
              fontSize: 11, fontWeight: 700,
              boxShadow: isActive ? `0 3px 12px ${color}30` : 'none',
              transition: 'all 0.18s var(--ease-spring)',
              transform: isActive ? 'scale(1.04)' : 'scale(1)',
              letterSpacing: '-0.01em',
            }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Announcements tab */}
      {activeTab === 'announcements' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibleAnnouncements.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: T.textMuted, fontSize: 12 }}>No announcements</div>
          )}
          {visibleAnnouncements.map(a => {
            const courseColor = courseColorMap[a.course_name] || T.teal;
            return (
              <div key={a.id} style={{
                background: 'transparent', backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '14px 16px',
                borderLeft: `3px solid ${courseColor}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text, flex: 1, lineHeight: 1.3 }}>{a.title}</div>
                  <div style={{ fontSize: 9, color: T.textMuted, flexShrink: 0, marginLeft: 10 }}>
                    {new Date(a.posted_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
                <div style={{ fontSize: 10, fontWeight: 600, color: courseColor, marginBottom: 6 }}>
                  {a.course_name} · {a.author?.display_name}
                </div>
                <div style={{ fontSize: 11, color: T.textSoft, lineHeight: 1.6 }}>{stripHtml(a.message)}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Assignment views (All + course tabs) */}
      {activeTab !== 'announcements' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

          {/* Overdue — not submitted */}
          {visibleOverdue.length > 0 && (
            <>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#D50000', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>⚠️</span> Overdue · not submitted
              </div>
              {visibleOverdue.map(a => (
                <AssignmentCard key={a.id} a={a} courseColor={courseColorMap[a.course_name] || T.teal} showCourse={!activeCourse} />
              ))}
            </>
          )}

          {/* Pending */}
          {visiblePending.length > 0 && (
            <>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.textMuted, marginBottom: 4, marginTop: visibleOverdue.length > 0 ? 12 : 0 }}>
                Action required · {visiblePending.length} pending
              </div>
              {visiblePending.map(a => (
                <AssignmentCard key={a.id} a={a} courseColor={courseColorMap[a.course_name] || T.teal} showCourse={!activeCourse} />
              ))}
            </>
          )}

          {visiblePending.length === 0 && visibleOverdue.length === 0 && visibleUndated.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '28px 20px',
              background: 'rgba(11,128,67,0.07)', borderRadius: 16, border: '1px solid rgba(11,128,67,0.15)',
            }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0B8043' }}>All caught up!</div>
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>No pending items for this tab.</div>
            </div>
          )}

          {/* Undated — open-ended items, no due date */}
          {visibleUndated.length > 0 && (
            <>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.textMuted, marginBottom: 4, marginTop: 16 }}>
                Undated · {visibleUndated.length}
              </div>
              {visibleUndated.map(a => (
                <AssignmentCard key={a.id} a={a} courseColor={courseColorMap[a.course_name] || T.teal} showCourse={!activeCourse} />
              ))}
            </>
          )}

          {/* Canvas calendar events (lectures, labs, key dates) */}
          {visibleEvents.length > 0 && (
            <>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.textMuted, marginTop: 18, marginBottom: 4 }}>
                Upcoming events · {visibleEvents.length}
              </div>
              {visibleEvents.map(e => {
                const color = courseColorMap[e.course_name] || T.teal;
                const when = e.start_at ? new Date(e.start_at).toLocaleDateString('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : '';
                return (
                  <a key={e.id} href={e.url || '#'} target="_blank" rel="noopener noreferrer" style={{
                    display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none',
                    padding: '10px 14px', marginBottom: 4,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderLeft: `3px solid ${color}`, borderRadius: '0 12px 12px 0',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</div>
                      <div style={{ fontSize: 10.5, color: T.textMuted, marginTop: 2 }}>
                        {!activeCourse && <span style={{ color, fontWeight: 600, marginRight: 6 }}>{e.course_name}</span>}
                        {when}{e.location_name ? ` · ${e.location_name}` : ''}
                      </div>
                    </div>
                  </a>
                );
              })}
            </>
          )}

          {/* Announcements strip for course tabs */}
          {activeCourse && visibleAnnouncements.length > 0 && (
            <>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.textMuted, marginTop: 16, marginBottom: 4 }}>
                Announcements
              </div>
              {visibleAnnouncements.slice(0, 3).map(a => {
                const courseColor = courseColorMap[a.course_name] || T.teal;
                return (
                  <div key={a.id} style={{
                    background: 'transparent', borderRadius: 12, padding: '11px 14px',
                    borderLeft: `3px solid ${courseColor}`, border: `1px solid rgba(255,255,255,0.8)`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: T.text, flex: 1 }}>{a.title}</div>
                      <div style={{ fontSize: 9, color: T.textMuted, marginLeft: 8 }}>
                        {new Date(a.posted_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: T.textSoft, lineHeight: 1.5 }}>{stripHtml(a.message)}</div>
                  </div>
                );
              })}
            </>
          )}

          {/* Completed (submitted) — collapsed by default */}
          {visibleSubmitted.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <button onClick={() => setShowCompleted(s => ({ ...s, [completedKey]: !showCompletedForTab }))} style={{
                display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: 6,
              }}>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#0B8043' }}>
                  ✓ Submitted · {visibleSubmitted.length}
                </span>
                <span style={{ fontSize: 10, color: T.textMuted }}>{showCompletedForTab ? '▲' : '▼'}</span>
              </button>
              {showCompletedForTab && visibleSubmitted.map(a => (
                <div key={a.id} style={{
                  background: 'transparent', border: '1px solid rgba(0,0,0,0.05)',
                  borderRadius: 10, padding: '9px 14px', marginBottom: 5, opacity: 0.6,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: T.textSoft }}>{fixName(a.name)}</div>
                    {!activeCourse && <div style={{ fontSize: 10, color: T.textMuted }}>{a.course_name}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: '#0B8043', fontWeight: 700 }}>✓</span>
                    {a.due_at && <span style={{ fontSize: 9, color: T.textMuted }}>{formatDate(a.due_at)}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Assignment card component ─────────────────────────────────────────────────

function AssignmentCard({ a, courseColor, showCourse }: { a: Assignment; courseColor: string; showCourse: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const days = a.due_at ? daysUntil(a.due_at) : null;
  const urg = days !== null ? urgencyConfig(days) : null;
  const plan = days !== null ? prepPlan(a.name, days, a.has_submitted_submissions) : null;
  const name = fixName(a.name);

  return (
    <div style={{
      background: urg ? urg.bg : 'rgba(255,255,255,0.06)',
      backdropFilter: 'blur(14px)',
      border: `1px solid rgba(255,255,255,0.85)`,
      borderLeft: `3px solid ${urg ? urg.color : courseColor}`,
      borderRadius: '0 14px 14px 0',
      padding: '13px 14px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
      animation: 'slideUp 0.3s ease both',
      cursor: 'pointer',
    } as React.CSSProperties}
    onClick={() => setExpanded(e => !e)}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.3, marginBottom: 3 }}>{name}</div>
          <div style={{ fontSize: 10, color: T.textMuted }}>
            {showCourse && <span style={{ color: courseColor, fontWeight: 600 }}>{a.course_name} · </span>}
            {a.due_at ? `Due ${formatDate(a.due_at)}` : 'No due date'}
          </div>
        </div>
        {urg && (
          <div style={{
            flexShrink: 0, padding: '4px 9px', borderRadius: 7,
            background: `${urg.color}18`, color: urg.color,
            fontSize: 10, fontWeight: 800, letterSpacing: '0.04em',
          }}>
            {urg.label}
          </div>
        )}
      </div>

      {/* Prep plan — always visible for urgent, collapsed otherwise */}
      {plan && (days !== null && days <= 7 || expanded) && (
        <div style={{
          marginTop: 10, padding: '8px 11px', borderRadius: 9,
          background: 'transparent', border: '1px solid rgba(255,255,255,0.06)',
          fontSize: 11, color: T.textSoft, lineHeight: 1.6,
        }}>
          {plan}
        </div>
      )}

      {/* Show prep for longer items on expand */}
      {plan && days !== null && days > 7 && !expanded && (
        <div style={{ marginTop: 6, fontSize: 10, color: T.textMuted }}>
          Tap for prep plan ›
        </div>
      )}
    </div>
  );
}
