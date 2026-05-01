'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { T, DOMAINS } from '@/lib/theme';

/* ── Primary nav ── */
const NAV: { id: string; label: string; icon: (a: boolean) => React.ReactNode; kbd?: string }[] = [
  { id: '/home', label: 'Today', kbd: '1',
    icon: (a) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M4 8.5L12 3l8 5.5V20a1 1 0 01-1 1h-4v-7h-6v7H5a1 1 0 01-1-1V8.5z"
          stroke={a ? T.teal : T.textMuted} strokeWidth="1.7" fill={a ? 'var(--teal-glow)' : 'none'} strokeLinejoin="round" />
      </svg>
    ),
  },
  { id: '/calendar', label: 'Calendar', kbd: '2',
    icon: (a) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="5" width="18" height="16" rx="2.5" stroke={a ? T.teal : T.textMuted} strokeWidth="1.7" fill={a ? 'var(--teal-glow)' : 'none'}/>
        <path d="M7 3v4M17 3v4M3 10h18" stroke={a ? T.teal : T.textMuted} strokeWidth="1.7" strokeLinecap="round"/>
      </svg>
    ),
  },
  { id: '/tomorrow', label: 'Tomorrow', kbd: '3',
    icon: (a) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M12 3a9 9 0 109 9" stroke={a ? T.teal : T.textMuted} strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M12 7v5l3 2" stroke={a ? T.teal : T.textMuted} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  { id: '/focus', label: 'Focus', kbd: '4',
    icon: (a) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="8" stroke={a ? T.teal : T.textMuted} strokeWidth="1.7" fill={a ? 'var(--teal-glow)' : 'none'}/>
        <circle cx="12" cy="12" r="3" fill={a ? T.teal : T.textMuted}/>
      </svg>
    ),
  },
  { id: '/canvas', label: 'Canvas', kbd: '5',
    icon: (a) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M12 3l2.5 6 6.5.5-5 4.5L18 21l-6-3.5L6 21l1.5-7-5-4.5 6.5-.5L12 3z"
          stroke={a ? T.teal : T.textMuted} strokeWidth="1.6" fill={a ? 'var(--teal-glow)' : 'none'} strokeLinejoin="round"/>
      </svg>
    ),
  },
  { id: '/progress', label: 'Progress', kbd: '6',
    icon: (a) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M4 20h16M7 20V11m4 9V5m4 15v-7m4 7V9" stroke={a ? T.teal : T.textMuted} strokeWidth="1.7" strokeLinecap="round"/>
      </svg>
    ),
  },
  { id: '/settings', label: 'Settings', kbd: ',',
    icon: (a) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3" stroke={a ? T.teal : T.textMuted} strokeWidth="1.7" fill={a ? 'var(--teal-glow)' : 'none'}/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H2a2 2 0 110-4h.09A1.65 1.65 0 004.6 8a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V2a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H22a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
          stroke={a ? T.teal : T.textMuted} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity={a ? 1 : 0.7}/>
      </svg>
    ),
  },
];

const TZ = 'Australia/Melbourne';

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function melbNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
}

/* ── Mini-month for sidebar ── */
function MiniMonth() {
  const [base, setBase] = useState(melbNow());
  const todayStr = isoDate(melbNow());
  const year = base.getFullYear();
  const month = base.getMonth();
  const firstDay = new Date(year, month, 1);
  const startGrid = new Date(firstDay);
  startGrid.setDate(1 - firstDay.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(startGrid); d.setDate(startGrid.getDate() + i); return d;
  });
  const monthName = firstDay.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

  return (
    <div style={{ padding: '10px 14px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="title-display" style={{ fontSize: 12, fontWeight: 600, color: T.text, letterSpacing: '-0.02em' }}>{monthName}</span>
        <div style={{ display: 'flex', gap: 2 }}>
          <button onClick={() => setBase(new Date(year, month - 1, 1))}
            style={{ width: 22, height: 22, borderRadius: 6, background: 'transparent', cursor: 'pointer', color: T.textMuted, fontSize: 14, border: 'none' }}>‹</button>
          <button onClick={() => setBase(melbNow())}
            style={{ width: 22, height: 22, borderRadius: 6, background: 'transparent', cursor: 'pointer', color: T.textMuted, fontSize: 10, border: 'none' }}>•</button>
          <button onClick={() => setBase(new Date(year, month + 1, 1))}
            style={{ width: 22, height: 22, borderRadius: 6, background: 'transparent', cursor: 'pointer', color: T.textMuted, fontSize: 14, border: 'none' }}>›</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 3 }}>
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: T.textFaint, letterSpacing: '0.06em' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
        {cells.map((d, i) => {
          const ds = isoDate(d);
          const inMonth = d.getMonth() === month;
          const isToday = ds === todayStr;
          return (
            <Link key={i} href={`/calendar?d=${ds}`} className="mono" style={{
              textAlign: 'center', fontSize: 10.5, width: '100%', aspectRatio: '1',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 6, textDecoration: 'none',
              color: isToday ? '#fff' : inMonth ? T.text : T.textFaint,
              fontWeight: isToday ? 700 : 500,
              background: isToday ? T.teal : 'transparent',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { if (!isToday) e.currentTarget.style.background = 'var(--surface-hover)'; }}
            onMouseLeave={e => { if (!isToday) e.currentTarget.style.background = 'transparent'; }}
            >{d.getDate()}</Link>
          );
        })}
      </div>
    </div>
  );
}

/* ── Domain filter (persisted in localStorage) ── */
function DomainFilters() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem('cmd-domains') || '{}'); } catch { return {}; }
  });
  const toggle = (id: string) => {
    setEnabled(prev => {
      const next = { ...prev, [id]: !(prev[id] ?? true) };
      try { localStorage.setItem('cmd-domains', JSON.stringify(next)); } catch {}
      window.dispatchEvent(new CustomEvent('cmd-domains-changed', { detail: next }));
      return next;
    });
  };
  return (
    <div style={{ padding: '8px 10px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textFaint, padding: '4px 4px 6px' }}>Domains</div>
      {DOMAINS.map(d => {
        const on = enabled[d.id] ?? true;
        return (
          <button key={d.id} onClick={() => toggle(d.id)}
            title={d.description}
            style={{
              display: 'flex', alignItems: 'center', gap: 9, width: '100%',
              padding: '5px 8px', borderRadius: 8, border: 'none',
              background: 'transparent', cursor: 'pointer', textAlign: 'left',
              transition: 'background 0.15s',
              opacity: on ? 1 : 0.42,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{
              width: 10, height: 10, borderRadius: 3,
              background: d.color,
              boxShadow: on ? `0 0 0 1px ${d.color}50, 0 0 8px ${d.color}40` : 'none',
              transition: 'box-shadow 0.2s',
            }} />
            <span style={{ fontSize: 12, color: T.text, fontWeight: 500, flex: 1 }}>{d.label}</span>
            {!on && <span style={{ fontSize: 9, color: T.textFaint }}>hidden</span>}
          </button>
        );
      })}
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const name = session?.user?.name || session?.user?.email || 'You';
  const initial = name[0]?.toUpperCase() || 'H';

  // Keyboard: number keys 1-6 for quick nav
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const item = NAV.find(n => n.kbd === e.key);
      if (item) { e.preventDefault(); window.location.href = item.id; }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <nav className="app-sidebar">
      {/* Brand */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '18px 16px 14px',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 9,
          background: `linear-gradient(135deg, var(--teal-dk), var(--teal-lt))`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 800, color: '#fff',
          boxShadow: '0 0 18px var(--teal-glow), inset 0 1px 0 rgba(255,255,255,0.25)',
          flexShrink: 0,
        }}>◈</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="title-display" style={{ fontSize: 14, fontWeight: 700, color: T.text, letterSpacing: '-0.02em', lineHeight: 1 }}>Commander</div>
          <div style={{ fontSize: 9.5, color: T.textFaint, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 2 }}>AI Planner</div>
        </div>
      </div>

      {/* Command bar trigger */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('cmd-open'))}
        style={{
          margin: '10px 12px 6px',
          padding: '7px 12px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          display: 'flex', alignItems: 'center', gap: 10,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.borderColor = 'var(--teal-brd)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke={T.textMuted} strokeWidth="2"/>
          <path d="M21 21l-4.35-4.35" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <span style={{ fontSize: 11.5, color: T.textMuted, flex: 1, textAlign: 'left' }}>Search…</span>
        <span className="mono" style={{ fontSize: 10, color: T.textFaint, background: 'var(--surface)', padding: '2px 5px', borderRadius: 4, border: '1px solid var(--border)' }}>⌘K</span>
      </button>

      {/* Nav */}
      <div style={{ padding: '6px 10px 8px' }}>
        {NAV.map(({ id, label, icon, kbd }) => {
          const p = pathname || '';
          const active = p === id || (id === '/home' && (p === '/' || p === '/home')) || (id !== '/home' && p.startsWith(id + '/')) || (id !== '/home' && p === id);
          return (
            <Link key={id} href={id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 10px', borderRadius: 8, marginBottom: 1,
              textDecoration: 'none', cursor: 'pointer',
              background: active ? 'var(--teal-glow)' : 'transparent',
              border: active ? '1px solid var(--teal-brd)' : '1px solid transparent',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-hover)'; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              {icon(active)}
              <span style={{
                fontSize: 12.5, fontWeight: active ? 600 : 500,
                color: active ? T.text : T.textSoft,
                letterSpacing: '-0.01em', flex: 1,
              }}>{label}</span>
              {kbd && <span className="mono" style={{ fontSize: 9.5, color: T.textFaint }}>{kbd}</span>}
            </Link>
          );
        })}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />

      {/* Scrollable middle */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <DomainFilters />
        <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />
        <MiniMonth />
      </div>

      {/* User footer */}
      <div style={{
        padding: '10px 14px',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--glass)',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: `linear-gradient(135deg, var(--teal-dk), var(--teal-lt))`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: '#fff',
          boxShadow: '0 2px 8px var(--teal-glow)',
        }}>{initial}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name.split(' ')[0]}
          </div>
          <div style={{ fontSize: 9.5, color: T.textFaint, letterSpacing: '0.04em' }}>Commander · v3</div>
        </div>
      </div>
    </nav>
  );
}
