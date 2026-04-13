'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { T } from '@/lib/theme';

const items = [
  {
    id: '/home', label: 'Home',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z"
          stroke={active ? T.teal : T.textMuted} strokeWidth="1.8"
          fill={active ? T.tealGlow : 'none'} strokeLinejoin="round" />
        <path d="M9 21v-7h6v7" stroke={active ? T.teal : T.textMuted} strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: '/tomorrow', label: 'Tomorrow',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
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
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke={active ? T.teal : T.textMuted} strokeWidth="1.8" fill={active ? T.tealGlow : 'none'} />
        <circle cx="12" cy="12" r="4" stroke={active ? T.teal : T.textMuted} strokeWidth="1.8" fill={active ? T.teal : 'none'} />
        <circle cx="12" cy="12" r="1" fill={active ? '#fff' : T.textMuted} />
      </svg>
    ),
  },
  {
    id: '/calendar', label: 'Calendar',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="17" rx="3"
          stroke={active ? T.teal : T.textMuted} strokeWidth="1.8" fill={active ? T.tealGlow : 'none'} />
        <path d="M16 2v4M8 2v4M3 9h18" stroke={active ? T.teal : T.textMuted} strokeWidth="1.8" strokeLinecap="round" />
        <rect x="7" y="13" width="3" height="3" rx="0.5" fill={active ? T.teal : T.textMuted} />
      </svg>
    ),
  },
  {
    id: '/settings', label: 'Settings',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3"
          stroke={active ? T.teal : T.textMuted} strokeWidth="1.8" fill={active ? T.tealGlow : 'none'} />
        <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
          stroke={active ? T.teal : T.textMuted} strokeWidth="1.8" strokeLinecap="round" />
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
      background: 'var(--bottom-nav-bg)',
      borderTop: '1px solid var(--subtle-border)',
      display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      paddingTop: 8, paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
      height: 80, zIndex: 90,
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
    }}>
      {items.map(({ id, icon, label }) => {
        const active = pathname === id || (id !== '/home' && pathname.startsWith(id));
        return (
          <Link key={id} href={id} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            cursor: 'pointer', padding: '2px 14px', borderRadius: 12,
            textDecoration: 'none', position: 'relative',
            transition: 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            <div style={{
              transition: 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)',
              transform: active ? 'scale(1.12)' : 'scale(1)',
            }}>
              {icon(active)}
            </div>
            <span style={{
              fontSize: 9, marginTop: 3, fontWeight: active ? 600 : 400,
              color: active ? T.teal : T.textMuted,
              letterSpacing: '0.02em',
            }}>{label}</span>
            {active && (
              <div style={{
                position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)',
                width: 4, height: 4, borderRadius: '50%',
                background: T.teal,
                boxShadow: `0 0 6px ${T.teal}`,
              }} />
            )}
          </Link>
        );
      })}
    </div>
  );
}
