'use client';

import Link from 'next/link';
import { T } from '@/lib/theme';

export default function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ padding: '16px 20px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/home" style={{
          cursor: 'pointer', color: T.textMuted, fontSize: 16,
          width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 10, textDecoration: 'none',
          background: 'rgba(255,255,255,0.52)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.8)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          transition: 'transform 0.2s cubic-bezier(0.34,1.56,0.64,1)',
        }}>{'←'}</Link>
        <div>
          <div style={{ fontSize: 21, fontWeight: 700, color: T.text, letterSpacing: '-0.5px' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 1, fontWeight: 400 }}>{subtitle}</div>}
        </div>
      </div>
    </div>
  );
}
