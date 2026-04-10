'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { T } from '@/lib/theme';

function UnsubscribeContent() {
  const params = useSearchParams();
  const success = params.get('success') === 'true';
  const type = params.get('type') || 'all';

  const typeLabel = type === 'all' ? 'all emails' : type === 'briefing' ? 'weekly briefings' : type === 'todo' ? "tomorrow's to-do emails" : 'weekly summaries';

  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ maxWidth: 420, textAlign: 'center', background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 20, padding: '40px 32px' }}>
        {success ? (
          <>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 8 }}>Unsubscribed</div>
            <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.7, fontWeight: 300, marginBottom: 24 }}>
              You have been unsubscribed from {typeLabel}. You can re-enable notifications anytime in your Settings.
            </div>
            <Link href="/login" style={{ fontSize: 13, color: T.teal, textDecoration: 'none' }}>Go to AI Planner &rarr;</Link>
          </>
        ) : (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 8 }}>Unsubscribe</div>
            <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.7, fontWeight: 300 }}>
              Use the link in your email to unsubscribe, or sign in and manage notifications in Settings.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return <Suspense fallback={<div style={{ minHeight: '100vh', background: T.bg }} />}><UnsubscribeContent /></Suspense>;
}
