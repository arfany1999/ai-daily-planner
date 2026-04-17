'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Nav from '@/components/Nav';
import BottomNav from '@/components/BottomNav';
import Sidebar from '@/components/Sidebar';
import TrialBanner from '@/components/TrialBanner';
import CommandBar from '@/components/CommandBar';

let subCache: { data: Record<string, unknown>; ts: number } | null = null;
const SUB_TTL = 5 * 60 * 1000; // cache for 5 minutes

function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);
  const [paymentFailed, setPaymentFailed] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (checked) return;

    // If just subscribed, skip check briefly to allow webhook to process
    if (searchParams.get('subscribed') === '1') {
      setTrialDaysLeft(30);
      setChecked(true);
      return;
    }

    // Use cached result if fresh
    if (subCache && Date.now() - subCache.ts < SUB_TTL) {
      const sub = subCache.data;
      if (!sub.hasAccess) { router.replace('/paywall'); return; }
      if (sub.inTrial && !sub.isAdmin) setTrialDaysLeft(sub.trialDaysLeft as number);
      if (sub.paymentFailed && !sub.isAdmin) setPaymentFailed(true);
      setChecked(true);
      return;
    }

    fetch('/api/subscription')
      .then((r) => r.json())
      .then((sub) => {
        subCache = { data: sub, ts: Date.now() };
        if (!sub.hasAccess) {
          router.replace('/paywall');
          return;
        }
        if (sub.inTrial && !sub.isAdmin) setTrialDaysLeft(sub.trialDaysLeft);
        if (sub.paymentFailed && !sub.isAdmin) setPaymentFailed(true);
        setChecked(true);
      })
      .catch(() => { setChecked(true); }); // fail open
  }, [checked, router, searchParams]);

  return (
    <>
      {trialDaysLeft !== null && trialDaysLeft <= 7 && (
        <TrialBanner daysLeft={trialDaysLeft} />
      )}
      {paymentFailed && (
        <div style={{
          background: 'rgba(229,77,77,0.08)',
          borderBottom: '1px solid rgba(229,77,77,0.15)',
          padding: '8px 20px',
          fontSize: 12,
          color: '#c0392b',
          textAlign: 'center',
        }}>
          Your last payment failed.{' '}
          <button
            onClick={async () => {
              const res = await fetch('/api/stripe/portal', { method: 'POST' });
              const { url } = await res.json();
              if (url) window.location.href = url;
            }}
            style={{ background: 'none', border: 'none', color: '#e54d4d', fontWeight: 600, cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: 0 }}
          >
            Update payment method
          </button>
        </div>
      )}
      {children}
    </>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // App is always dark (Dispatch aesthetic) — no toggle needed

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex' }}>
      <div id="commander-bg" />
      <Sidebar />
      <div className="app-main-inner" style={{ position: 'relative', zIndex: 1 }}>
        <div className="top-nav-mobile-only">
          <Nav />
        </div>

        <Suspense fallback={null}>
          <SubscriptionGuard>
            <main className="app-main-content" style={{ paddingBottom: 120 }}>
              {children}
            </main>
          </SubscriptionGuard>
        </Suspense>

        <CommandBar />

        <div className="bottom-nav-wrapper">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
