'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { T } from '@/lib/theme';

const items = [
  {
    id: '/home', label: 'Home',
    icon: (active: boolean) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z"
          stroke={active ? T.teal : T.textMuted} strokeWidth="1.8"
          fill={active ? T.tealGlow : 'none'} strokeLinejoin="round" />
        <path d="M9 21v-7h6v7" stroke={active ? T.teal : T.textMuted} strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: '/calendar', label: 'Calendar',
    icon: (active: boolean) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="17" rx="3"
          stroke={active ? T.teal : T.textMuted} strokeWidth="1.8" fill={active ? T.tealGlow : 'none'} />
        <path d="M16 2v4M8 2v4M3 9h18" stroke={active ? T.teal : T.textMuted} strokeWidth="1.8" strokeLinecap="round" />
        <rect x="7" y="13" width="3" height="3" rx="0.5" fill={active ? T.teal : T.textMuted} />
      </svg>
    ),
  },
  {
    id: '/tomorrow', label: 'Tomorrow',
    icon: (active: boolean) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="17" rx="3"
          stroke={active ? T.teal : T.textMuted} strokeWidth="1.8" fill={active ? T.tealGlow : 'none'} />
        <path d="M16 2v4M8 2v4M3 9h18" stroke={active ? T.teal : T.textMuted} strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="15" r="1.5" fill={active ? T.teal : T.textMuted} />
      </svg>
    ),
  },
  {
    id: '/focus', label: 'Focus',
    icon: (active: boolean) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke={active ? T.teal : T.textMuted} strokeWidth="1.8" fill={active ? T.tealGlow : 'none'} />
        <circle cx="12" cy="12" r="4" stroke={active ? T.teal : T.textMuted} strokeWidth="1.8" fill={active ? T.teal : 'none'} />
        <circle cx="12" cy="12" r="1" fill={active ? '#fff' : T.textMuted} />
      </svg>
    ),
  },
  {
    id: '/canvas', label: 'Canvas',
    icon: (active: boolean) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
          stroke={active ? T.teal : T.textMuted} strokeWidth="1.8"
          fill={active ? T.tealGlow : 'none'} strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: '/progress', label: 'Progress',
    icon: (active: boolean) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M3 20h18M7 20V10m4 10V4m4 16v-7m4 7v-4"
          stroke={active ? T.teal : T.textMuted} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: '/settings', label: 'Settings',
    icon: (active: boolean) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3" stroke={active ? T.teal : T.textMuted} strokeWidth="1.8" fill={active ? T.tealGlow : 'none'} />
        <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
          stroke={active ? T.teal : T.textMuted} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const name = session?.user?.name || session?.user?.email || 'You';
  const initial = name[0]?.toUpperCase() || 'H';

  return (
    <nav className="app-sidebar">
      {/* Logo */}
      <Link href="/home" style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '22px 20px 18px', textDecoration: 'none',
        borderBottom: '1px solid var(--subtle-border)',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10,
          background: `linear-gradient(135deg,${T.tealDk},${T.teal})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, color: '#fff',
          boxShadow: `0 3px 10px ${T.tealGlow}`, flexShrink: 0,
        }}>A</div>
        <span style={{ fontSize: 16, fontWeight: 700, color: T.text, letterSpacing: '-0.4px' }}>AI Planner</span>
      </Link>

      {/* Nav items */}
      <div style={{ flex: 1, padding: '10px 10px' }}>
        {items.map(({ id, label, icon }) => {
          const active = pathname === id || (id !== '/home' && pathname.startsWith(id));
          return (
            <Link key={id} href={id} style={{
              display: 'flex', alignItems: 'center', gap: 11,
              padding: '9px 12px', borderRadius: 10, marginBottom: 2,
              textDecoration: 'none', cursor: 'pointer',
              background: active ? T.teal + '14' : 'transparent',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-hover)'; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              {icon(active)}
              <span style={{
                fontSize: 13, fontWeight: active ? 600 : 400,
                color: active ? T.teal : T.text,
                letterSpacing: '-0.1px',
              }}>{label}</span>
              {active && (
                <div style={{
                  marginLeft: 'auto', width: 5, height: 5, borderRadius: '50%',
                  background: T.teal, boxShadow: `0 0 6px ${T.teal}`,
                }} />
              )}
            </Link>
          );
        })}
      </div>

      {/* User footer */}
      <div style={{
        padding: '14px 16px',
        borderTop: '1px solid var(--subtle-border)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          background: `linear-gradient(135deg,${T.tealDk},${T.teal})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 600, color: '#fff',
        }}>{initial}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name.split(' ')[0]}
          </div>
          <div style={{ fontSize: 10, color: T.textMuted }}>AI Planner</div>
        </div>
      </div>
    </nav>
  );
}
