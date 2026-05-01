'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { T } from '@/lib/theme';

const items = [
  { id: '/home', label: 'Today',
    icon: (a: boolean) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
        <path d="M4 8.5L12 3l8 5.5V20a1 1 0 01-1 1h-4v-7h-6v7H5a1 1 0 01-1-1V8.5z"
          stroke={a ? T.teal : T.textMuted} strokeWidth="1.6" fill={a ? 'var(--teal-glow)' : 'none'} strokeLinejoin="round"/>
      </svg>
    ),
  },
  { id: '/tasks', label: 'Tasks',
    icon: (a: boolean) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
        <path d="M9 11l3 3L22 4" stroke={a ? T.teal : T.textMuted} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke={a ? T.teal : T.textMuted} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill={a ? 'var(--teal-glow)' : 'none'}/>
      </svg>
    ),
  },
  { id: '/calendar', label: 'Calendar',
    icon: (a: boolean) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="5" width="18" height="16" rx="2.5" stroke={a ? T.teal : T.textMuted} strokeWidth="1.6" fill={a ? 'var(--teal-glow)' : 'none'}/>
        <path d="M7 3v4M17 3v4M3 10h18" stroke={a ? T.teal : T.textMuted} strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
  },
  { id: '/canvas', label: 'Canvas',
    icon: (a: boolean) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
        <path d="M12 3l2.5 6 6.5.5-5 4.5L18 21l-6-3.5L6 21l1.5-7-5-4.5 6.5-.5L12 3z"
          stroke={a ? T.teal : T.textMuted} strokeWidth="1.5" fill={a ? 'var(--teal-glow)' : 'none'} strokeLinejoin="round"/>
      </svg>
    ),
  },
  { id: '/settings', label: 'Settings',
    icon: (a: boolean) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3" stroke={a ? T.teal : T.textMuted} strokeWidth="1.6"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H2a2 2 0 110-4h.09A1.65 1.65 0 004.6 8a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V2a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H22a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
          stroke={a ? T.teal : T.textMuted} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" opacity={a ? 1 : 0.55}/>
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 430,
      background: 'var(--glass-hi)',
      borderTop: '1px solid var(--border)',
      display: 'flex', justifyContent: 'space-evenly', alignItems: 'center',
      paddingTop: 6, paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
      height: 68, zIndex: 90,
      backdropFilter: 'blur(32px) saturate(1.8)',
      WebkitBackdropFilter: 'blur(32px) saturate(1.8)',
    }}>
      {items.map((item) => {
        const active = pathname === item.id ||
          (item.id === '/home' && (pathname === '/' || pathname === '/home')) ||
          (item.id !== '/home' && pathname.startsWith(item.id));
        return (
          <Link key={item.id} href={item.id} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            cursor: 'pointer', padding: '4px 18px', borderRadius: 12,
            textDecoration: 'none', position: 'relative',
          }}>
            {active && (
              <div style={{
                position: 'absolute', top: -6,
                width: 18, height: 2, borderRadius: 1,
                background: `linear-gradient(90deg, var(--teal-dk), var(--teal-lt))`,
                boxShadow: `0 0 10px var(--teal-glow)`,
              }} />
            )}
            <div style={{
              transition: 'transform 0.2s var(--ease-spring)',
              transform: active ? 'scale(1.06)' : 'scale(1)',
              opacity: active ? 1 : 0.7,
            }}>
              {item.icon(active)}
            </div>
            <span style={{
              fontSize: 9, marginTop: 3, fontWeight: active ? 700 : 500,
              color: active ? T.teal : T.textMuted,
              letterSpacing: '0.03em',
              transition: 'color 0.2s ease',
            }}>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
