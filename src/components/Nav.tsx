'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { T } from '@/lib/theme';

export default function Nav() {
  const { data: session } = useSession();
  const initial = session?.user?.name?.[0] || session?.user?.email?.[0]?.toUpperCase() || 'H';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 20px',
      background: T.bg2 + 'e0',
      borderBottom: `1px solid ${T.border}`,
      backdropFilter: 'blur(16px)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      <Link href="/home" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
        <div style={{
          width: 26, height: 26, borderRadius: 7,
          background: `linear-gradient(135deg,${T.tealDk},${T.teal})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: '#fff',
        }}>A</div>
        <span style={{ fontSize: 16, fontWeight: 700, color: T.text, letterSpacing: '-0.5px' }}>AI Planner</span>
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {[{ label: 'Progress', href: '/progress' }, { label: 'Settings', href: '/settings' }].map((l) => (
          <Link key={l.label} href={l.href} style={{
            fontSize: 12, color: T.textMuted, cursor: 'pointer',
            padding: '5px 10px', borderRadius: 7, transition: 'all 0.2s',
            fontWeight: 500, textDecoration: 'none',
          }}>{l.label}</Link>
        ))}
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: `linear-gradient(135deg,${T.tealDk},${T.teal})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 600, color: '#fff',
        }}>{initial}</div>
      </div>
    </div>
  );
}
