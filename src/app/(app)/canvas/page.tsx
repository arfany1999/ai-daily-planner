'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/PageHeader';
import { T } from '@/lib/theme';

interface Assignment {
  id: number;
  name: string;
  course_name: string;
  due_at: string | null;
  has_submitted_submissions: boolean;
}

interface Announcement {
  id: number;
  title: string;
  message: string;
  posted_at: string;
  course_name: string;
  author: { display_name: string };
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
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    timeZone: 'Australia/Melbourne', weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit',
  });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().slice(0, 200);
}

export default function CanvasPage() {
  const [data, setData] = useState<CanvasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [tab, setTab] = useState<'assignments' | 'announcements'>('assignments');
  const [tokenInput, setTokenInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [tokenError, setTokenError] = useState('');

  useEffect(() => {
    fetch('/api/canvas')
      .then((r) => r.json())
      .then((d) => {
        if (d.data) {
          setData(d.data);
          setStale(d.stale || false);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const saveToken = async () => {
    setSaving(true);
    setTokenError('');
    try {
      const r = await fetch('/api/settings/canvas-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput }),
      });
      const d = await r.json();
      if (d.success) {
        // Refresh canvas data
        setTokenInput('');
        const canvasRes = await fetch('/api/canvas');
        const canvasData = await canvasRes.json();
        if (canvasData.data) setData(canvasData.data);
      } else {
        setTokenError(d.error || 'Failed to save token');
      }
    } catch {
      setTokenError('Network error');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div style={{ padding: '0 18px' }}>
        <PageHeader title="Canvas Feed" subtitle="Loading..." />
        <div style={{ textAlign: 'center', padding: 40, color: T.textMuted, fontSize: 12 }}>Fetching Canvas data...</div>
      </div>
    );
  }

  // Not connected state
  if (!data) {
    return (
      <div style={{ padding: '0 18px' }}>
        <PageHeader title="Canvas Feed" subtitle="RMIT announcements & updates" />
        <div style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: 14,
          padding: 24,
        }}>
          <div style={{ fontSize: 40, marginBottom: 12, textAlign: 'center' }}>🎓</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 8, textAlign: 'center' }}>Connect Canvas</div>
          <div style={{ fontSize: 12, color: T.textSoft, lineHeight: 1.7, fontWeight: 300, marginBottom: 16, textAlign: 'center' }}>
            Enter your RMIT Canvas API token. Get it from rmit.instructure.com &gt; Account &gt; Settings &gt; New Access Token.
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              type="password"
              placeholder="Paste your Canvas API token..."
              style={{
                flex: 1, padding: '10px 14px', background: T.bg,
                border: `1px solid ${T.border}`, borderRadius: 8,
                color: T.text, fontSize: 12, outline: 'none',
              }}
            />
            <button
              onClick={saveToken}
              disabled={saving || !tokenInput.trim()}
              style={{
                padding: '10px 18px',
                background: tokenInput.trim() ? `linear-gradient(135deg,${T.tealDk},${T.teal})` : '#333',
                color: tokenInput.trim() ? '#fff' : '#666',
                border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600,
                cursor: tokenInput.trim() ? 'pointer' : 'default',
                opacity: saving ? 0.5 : 1,
              }}
            >
              {saving ? 'Validating...' : 'Connect'}
            </button>
          </div>

          {tokenError && (
            <div style={{ marginTop: 10, fontSize: 11, color: T.red, padding: '8px 12px', background: T.red + '0c', borderRadius: 6 }}>
              {tokenError}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Connected state — show data
  const upcomingAssignments = data.assignments
    .filter((a) => a.due_at && daysUntil(a.due_at) >= 0)
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());

  const pastAssignments = data.assignments
    .filter((a) => a.due_at && daysUntil(a.due_at) < 0)
    .sort((a, b) => new Date(b.due_at!).getTime() - new Date(a.due_at!).getTime())
    .slice(0, 5);

  const recentAnnouncements = data.announcements
    .sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime())
    .slice(0, 15);

  return (
    <div style={{ padding: '0 18px' }}>
      <PageHeader title="Canvas Feed" subtitle={`${data.courses.length} active courses`} />

      {stale && (
        <div style={{ marginBottom: 10, fontSize: 10, color: T.yellow, background: T.yellow + '10', padding: '6px 12px', borderRadius: 6, border: `1px solid ${T.yellow}20` }}>
          Using cached data
        </div>
      )}

      {/* Courses summary */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {data.courses.map((c) => (
          <div key={c.id} style={{
            padding: '6px 12px', background: T.card, border: `1px solid ${T.border}`,
            borderRadius: 8, fontSize: 11, color: T.text, fontWeight: 500,
          }}>
            {c.course_code}
          </div>
        ))}
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {(['assignments', 'announcements'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '9px 0',
            background: tab === t ? `linear-gradient(135deg,${T.tealDk},${T.teal})` : T.card,
            color: tab === t ? '#fff' : T.textMuted,
            border: `1px solid ${tab === t ? T.teal : T.border}`,
            borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            textTransform: 'capitalize',
          }}>{t} ({t === 'assignments' ? data.assignments.length : data.announcements.length})</button>
        ))}
      </div>

      {/* Assignments tab */}
      {tab === 'assignments' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {upcomingAssignments.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.orange, marginBottom: 2 }}>Upcoming</div>
              {upcomingAssignments.map((a) => {
                const days = daysUntil(a.due_at!);
                const urgent = days <= 3;
                return (
                  <div key={a.id} style={{
                    background: T.card, border: `1px solid ${urgent ? T.red + '30' : T.border}`,
                    borderRadius: 10, padding: '12px 14px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text, flex: 1 }}>{a.name}</div>
                      <div style={{
                        fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 5, flexShrink: 0, marginLeft: 8,
                        background: urgent ? T.red + '15' : T.yellow + '15',
                        color: urgent ? T.red : T.yellow,
                      }}>
                        {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: T.textSoft, fontWeight: 300 }}>
                      {a.course_name} {'\u2022'} Due {formatDate(a.due_at!)}
                    </div>
                    {a.has_submitted_submissions && (
                      <div style={{ marginTop: 4, fontSize: 10, color: T.green, fontWeight: 500 }}>{'\u2713'} Submitted</div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {pastAssignments.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textMuted, marginTop: 12, marginBottom: 2 }}>Past</div>
              {pastAssignments.map((a) => (
                <div key={a.id} style={{
                  background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
                  padding: '10px 14px', opacity: 0.5,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: T.textSoft }}>{a.name}</div>
                  <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 300 }}>
                    {a.course_name} {'\u2022'} Due {formatDate(a.due_at!)}
                    {a.has_submitted_submissions && <span style={{ color: T.green, marginLeft: 6 }}>{'\u2713'} Submitted</span>}
                  </div>
                </div>
              ))}
            </>
          )}

          {upcomingAssignments.length === 0 && pastAssignments.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: T.textMuted, fontSize: 12 }}>No assignments found.</div>
          )}
        </div>
      )}

      {/* Announcements tab */}
      {tab === 'announcements' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {recentAnnouncements.map((a) => (
            <div key={a.id} style={{
              background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
              padding: '12px 14px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text, flex: 1 }}>{a.title}</div>
                <div style={{ fontSize: 9, color: T.textMuted, flexShrink: 0, marginLeft: 8 }}>
                  {new Date(a.posted_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                </div>
              </div>
              <div style={{ fontSize: 11, color: T.blue, fontWeight: 500, marginBottom: 4 }}>
                {a.course_name} {'\u2022'} {a.author?.display_name}
              </div>
              <div style={{ fontSize: 11, color: T.textSoft, lineHeight: 1.6, fontWeight: 300 }}>
                {stripHtml(a.message)}
              </div>
            </div>
          ))}
          {recentAnnouncements.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: T.textMuted, fontSize: 12 }}>No recent announcements.</div>
          )}
        </div>
      )}
    </div>
  );
}
