'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { T } from '@/lib/theme';

const items = [
  { id: '/home', icon: '\u2302', label: 'Home' },
  { id: '/tomorrow', icon: '\u25CE', label: 'Tomorrow' },
  { id: '/materials', icon: '\u25C8', label: 'Study' },
  { id: '/calendar', icon: '\u25A3', label: 'Calendar' },
  { id: '/settings', icon: '\u2699', label: 'Settings' },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: T.bg2 + 'e0',
      borderTop: `1px solid ${T.border}`,
      display: 'flex', justifyContent: 'space-around',
      padding: '5px 0 8px', zIndex: 90,
      backdropFilter: 'blur(16px)',
    }}>
      {items.map(({ id, icon, label }) => {
        const active = pathname === id || (id !== '/home' && pathname.startsWith(id));
        return (
          <Link key={id} href={id} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            cursor: 'pointer', padding: '3px 10px', borderRadius: 7,
            textDecoration: 'none',
          }}>
            <span style={{ fontSize: 15, color: active ? T.teal : T.textMuted }}>{icon}</span>
            <span style={{ fontSize: 8, color: active ? T.teal : T.textMuted, fontWeight: active ? 600 : 400 }}>{label}</span>
          </Link>
        );
      })}
    </div>
  );
}
