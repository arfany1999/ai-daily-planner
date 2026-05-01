'use client';

import Link from 'next/link';
import { T } from '@/lib/theme';

export default function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ padding: '16px 20px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/home" style={{
          cursor: 'pointer', color: T.textMuted, fontSize: 14,
          width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 10, textDecoration: 'none',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          transition: 'all 0.2s ease',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M15 19l-7-7 7-7" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
        <div>
          <h1 className="title-display" style={{ fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: '-0.03em', lineHeight: 1.2 }}>{title}</h1>
          {subtitle && <div style={{ fontSize: 11.5, color: T.textMuted, marginTop: 2, fontWeight: 500 }}>{subtitle}</div>}
        </div>
      </div>
    </div>
  );
}
