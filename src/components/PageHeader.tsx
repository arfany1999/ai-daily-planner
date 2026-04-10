'use client';

import Link from 'next/link';
import { T } from '@/lib/theme';

export default function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ padding: '18px 20px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/home" style={{
          cursor: 'pointer', color: T.textMuted, fontSize: 16,
          width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8, transition: 'all 0.2s', textDecoration: 'none',
        }}>{'\u2190'}</Link>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: '-0.5px' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 1, fontWeight: 300 }}>{subtitle}</div>}
        </div>
      </div>
    </div>
  );
}
