'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/PageHeader';
import { T, DEMO_WEEKLY, urgencyColors } from '@/lib/theme';

interface BriefingDay {
  date: string;
  day_label: string;
  highlights: string[];
  events: { time: string; title: string; type: string }[];
  deadlines: string[];
  email_highlights: string[];
  priority_actions: string[];
}

interface Briefing {
  summary: string;
  days: BriefingDay[];
  week_priorities: string[];
}

const typeToColor: Record<string, string> = {
  class: 'class', work: 'work', gym: 'gym', ai: 'ai', other: 'break',
};

export default function WeeklyPage() {
  const [expDay, setExpDay] = useState(0);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [customPriorities, setCustomPriorities] = useState<string[]>([]);
  const [newPriority, setNewPriority] = useState('');
  const [addingPriority, setAddingPriority] = useState(false);

  useEffect(() => {
    fetch('/api/briefing')
      .then((r) => r.json())
      .then((d) => {
        if (d.briefing?.days?.length > 0) {
          setBriefing(d.briefing);
          setStale(d.stale || false);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Load custom priorities from localStorage
    try {
      const saved = localStorage.getItem('custom_priorities');
      if (saved) setCustomPriorities(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const addPriority = () => {
    const text = newPriority.trim();
    if (!text) return;
    const updated = [...customPriorities, text];
    setCustomPriorities(updated);
    localStorage.setItem('custom_priorities', JSON.stringify(updated));
    setNewPriority('');
    setAddingPriority(false);
  };

  const removePriority = (i: number) => {
    const updated = customPriorities.filter((_, idx) => idx !== i);
    setCustomPriorities(updated);
    localStorage.setItem('custom_priorities', JSON.stringify(updated));
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const r = await fetch('/api/briefing/refresh', { method: 'POST' });
      const d = await r.json();
      if (d.briefing?.days?.length > 0) {
        setBriefing(d.briefing);
        setStale(false);
      }
    } catch { /* keep current data */ }
    setRefreshing(false);
  };

  // Use real briefing data or fall back to demo
  const useDemoData = !briefing || briefing.days.length === 0;

  if (useDemoData) {
    return (
      <div style={{ padding: '0 18px' }}>
        <PageHeader title="Weekly Plan" subtitle="Tomorrow → next Monday" />
        {loading && (
          <div style={{ textAlign: 'center', padding: 20, color: T.textMuted, fontSize: 12 }}>Loading briefing...</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {DEMO_WEEKLY.map((d, i) => (
            <div key={i} style={{
              background: T.card, border: `1px solid ${expDay === i ? T.tealBrd : T.border}`,
              borderRadius: 12, overflow: 'hidden',
            }}>
              <div onClick={() => setExpDay(expDay === i ? -1 : i)} style={{
                padding: '12px 16px', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {d.tag && <span style={{ fontSize: 8, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: T.teal + '12', color: T.teal, textTransform: 'uppercase' }}>{d.tag}</span>}
                  <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{d.day}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {d.deadlines.length > 0 && <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.red }} />}
                  <span style={{ color: T.textMuted, fontSize: 9, transform: expDay === i ? 'rotate(180deg)' : '', transition: 'transform 0.3s', display: 'inline-block' }}>{'\u25BC'}</span>
                </div>
              </div>
              {expDay === i && (
                <div style={{ padding: '0 16px 14px', borderTop: `1px solid ${T.border}` }}>
                  {d.deadlines.map((dl, j) => (
                    <div key={j} style={{ margin: '8px 0 4px', padding: '7px 12px', background: T.red + '0c', borderLeft: `3px solid ${T.red}`, borderRadius: '0 8px 8px 0', fontSize: 11, color: T.red, fontWeight: 600 }}>{dl}</div>
                  ))}
                  {d.email && (
                    <div style={{ margin: '6px 0', padding: '7px 12px', background: T.tealGlow, borderLeft: `3px solid ${T.teal}`, borderRadius: '0 8px 8px 0', fontSize: 11, color: T.teal }}>{d.email}</div>
                  )}
                  {d.events.map((ev, j) => (
                    <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: j < d.events.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                      <span style={{ fontSize: 10, color: T.textMuted, width: 64, fontVariantNumeric: 'tabular-nums' }}>{ev.t}</span>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: urgencyColors[ev.tp] || T.teal }} />
                      <span style={{ fontSize: 12, color: T.text }}>{ev.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        {!loading && (
          <div style={{ marginTop: 16, padding: '12px 16px', background: T.glass, borderRadius: 10, border: `1px solid ${T.glassBrd}`, fontSize: 11, color: T.textMuted, fontWeight: 300 }}>
            Demo data shown. Sign in with Google and connect your calendar to see real briefings.
          </div>
        )}
      </div>
    );
  }

  // Real briefing data
  return (
    <div style={{ padding: '0 18px' }}>
      <PageHeader title="Weekly Plan" subtitle={briefing.summary?.slice(0, 60)} />

      {/* Stale indicator + refresh */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        {stale && (
          <div style={{ fontSize: 10, color: T.yellow, background: T.yellow + '10', padding: '4px 10px', borderRadius: 5, border: `1px solid ${T.yellow}20` }}>
            Using cached data
          </div>
        )}
        <button onClick={handleRefresh} disabled={refreshing} style={{
          marginLeft: 'auto', padding: '6px 14px', background: T.tealGlow,
          border: `1px solid ${T.tealBrd}`, borderRadius: 8,
          color: T.teal, fontSize: 10, fontWeight: 600, cursor: refreshing ? 'wait' : 'pointer',
          opacity: refreshing ? 0.5 : 1,
        }}>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Week priorities */}
      <div style={{
        background: 'transparent', backdropFilter: 'blur(14px)',
        border: `1px solid ${T.tealBrd}`, borderRadius: 14, padding: '14px 16px', marginBottom: 12,
        boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: T.teal }}>
            Week priorities
          </div>
          <button
            onClick={() => setAddingPriority(!addingPriority)}
            style={{
              width: 24, height: 24, borderRadius: 7, border: `1px solid ${T.tealBrd}`,
              background: addingPriority ? T.teal : T.tealGlow,
              color: addingPriority ? '#fff' : T.teal,
              fontSize: 16, fontWeight: 300, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1, transition: 'all 0.2s',
            }}
          >{addingPriority ? '×' : '+'}</button>
        </div>

        {/* AI-generated priorities */}
        {briefing.week_priorities?.map((p, i) => (
          <div key={i} style={{ fontSize: 13, color: T.text, lineHeight: 1.7, fontWeight: 400, display: 'flex', gap: 8, marginBottom: 3, alignItems: 'flex-start' }}>
            <span style={{ color: T.teal, marginTop: 2, flexShrink: 0 }}>•</span> {p}
          </div>
        ))}

        {/* User custom priorities */}
        {customPriorities.map((p, i) => (
          <div key={`c-${i}`} style={{ fontSize: 13, color: T.text, lineHeight: 1.7, fontWeight: 400, display: 'flex', gap: 8, marginBottom: 3, alignItems: 'flex-start' }}>
            <span style={{ color: T.orange, marginTop: 2, flexShrink: 0 }}>★</span>
            <span style={{ flex: 1 }}>{p}</span>
            <button
              onClick={() => removePriority(i)}
              style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', fontSize: 11, padding: '0 2px', lineHeight: 1 }}
            >×</button>
          </div>
        ))}

        {/* Add input */}
        {addingPriority && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <input
              autoFocus
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addPriority(); if (e.key === 'Escape') { setAddingPriority(false); setNewPriority(''); } }}
              placeholder="Add your own priority..."
              style={{
                flex: 1, padding: '8px 12px', fontSize: 12,
                background: 'transparent',
                border: `1.5px solid ${T.tealBrd}`,
                borderRadius: 9, color: T.text, outline: 'none',
              }}
            />
            <button
              onClick={addPriority}
              disabled={!newPriority.trim()}
              style={{
                padding: '8px 14px', borderRadius: 9, border: 'none',
                background: newPriority.trim() ? T.teal : 'rgba(0,0,0,0.08)',
                color: newPriority.trim() ? '#fff' : T.textMuted,
                fontSize: 12, fontWeight: 600, cursor: newPriority.trim() ? 'pointer' : 'default',
              }}
            >Add</button>
          </div>
        )}

        {!briefing.week_priorities?.length && !customPriorities.length && !addingPriority && (
          <div style={{ fontSize: 12, color: T.textMuted, fontStyle: 'italic' }}>No priorities yet. Tap + to add one.</div>
        )}
      </div>

      {/* Days */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {briefing.days.map((d, i) => (
          <div key={i} style={{
            background: T.card, border: `1px solid ${expDay === i ? T.tealBrd : T.border}`,
            borderRadius: 12, overflow: 'hidden',
          }}>
            <div onClick={() => setExpDay(expDay === i ? -1 : i)} style={{
              padding: '12px 16px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {i === 0 && <span style={{ fontSize: 8, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: T.teal + '12', color: T.teal, textTransform: 'uppercase' }}>tomorrow</span>}
                <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{d.day_label}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {d.deadlines?.length > 0 && <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.red }} />}
                <span style={{ color: T.textMuted, fontSize: 9, transform: expDay === i ? 'rotate(180deg)' : '', transition: 'transform 0.3s', display: 'inline-block' }}>{'\u25BC'}</span>
              </div>
            </div>
            {expDay === i && (
              <div style={{ padding: '0 16px 14px', borderTop: `1px solid ${T.border}` }}>
                {/* Deadlines */}
                {d.deadlines?.map((dl, j) => (
                  <div key={j} style={{ margin: '8px 0 4px', padding: '7px 12px', background: T.red + '0c', borderLeft: `3px solid ${T.red}`, borderRadius: '0 8px 8px 0', fontSize: 11, color: T.red, fontWeight: 600 }}>{dl}</div>
                ))}

                {/* Email highlights */}
                {d.email_highlights?.map((eh, j) => (
                  <div key={j} style={{ margin: '6px 0', padding: '7px 12px', background: T.tealGlow, borderLeft: `3px solid ${T.teal}`, borderRadius: '0 8px 8px 0', fontSize: 11, color: T.teal }}>{eh}</div>
                ))}

                {/* Events */}
                {d.events?.map((ev, j) => (
                  <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: j < d.events.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                    <span style={{ fontSize: 10, color: T.textMuted, width: 64, fontVariantNumeric: 'tabular-nums' }}>{ev.time}</span>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: urgencyColors[typeToColor[ev.type] || 'break'] || T.teal }} />
                    <span style={{ fontSize: 12, color: T.text }}>{ev.title}</span>
                  </div>
                ))}

                {/* Highlights */}
                {d.highlights?.length > 0 && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: T.glass, borderRadius: 8, border: `1px solid ${T.glassBrd}` }}>
                    {d.highlights.map((h, j) => (
                      <div key={j} style={{ fontSize: 11, color: T.textSoft, lineHeight: 1.6, fontWeight: 300 }}>{h}</div>
                    ))}
                  </div>
                )}

                {/* Priority actions */}
                {d.priority_actions?.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    {d.priority_actions.map((a, j) => (
                      <div key={j} style={{ fontSize: 11, color: T.orange, display: 'flex', gap: 6, padding: '2px 0' }}>
                        <span>{'→'}</span> {a}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
