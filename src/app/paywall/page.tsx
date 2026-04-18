'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function PaywallContent() {
  const [loading, setLoading] = useState(false);
  const [autoFailed, setAutoFailed] = useState(false);
  const searchParams = useSearchParams();
  const cancelled = searchParams.get('cancelled');
  const autoTriggeredRef = useRef(false);

  const handleSubscribe = async () => {
    setLoading(true);
    setAutoFailed(false);
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' });
      if (!res.ok) { setAutoFailed(true); setLoading(false); return; }
      const { url, error } = await res.json() as { url?: string; error?: string };
      if (url) { window.location.href = url; return; }
      setAutoFailed(true);
      console.error('Stripe checkout:', error);
      setLoading(false);
    } catch {
      setAutoFailed(true);
      setLoading(false);
    }
  };

  // Auto-redirect to Stripe the moment the user lands here — unless they
  // came back from Stripe via the cancel link (cancelled=1), in which
  // case we let them choose to try again rather than bouncing in a loop.
  useEffect(() => {
    if (cancelled) return;
    if (autoTriggeredRef.current) return;
    autoTriggeredRef.current = true;
    handleSubscribe();
  }, [cancelled]);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0A0A08',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      fontFamily: "'Inter', -apple-system, 'Helvetica Neue', sans-serif",
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 24,
        border: '1px solid rgba(255,255,255,0.06)',
        padding: '48px 36px',
        textAlign: 'center',
      }}>
        <img
          src="/icons/icon-source.jpg"
          alt="AI Daily"
          style={{ width: 64, height: 64, borderRadius: 16, objectFit: 'cover', marginBottom: 20, boxShadow: '0 6px 20px rgba(196,118,74,0.2)' }}
        />

        <div style={{ fontSize: 22, fontWeight: 500, color: '#E8E0D8', letterSpacing: '-0.5px', marginBottom: 8 }}>
          Your free trial has ended
        </div>
        <div style={{ fontSize: 14, color: '#8A7D70', marginBottom: 32, lineHeight: 1.6 }}>
          Subscribe to keep your schedule, AI briefings, Canvas sync, and everything else running.
        </div>

        {cancelled && (
          <div style={{ padding: '10px 14px', marginBottom: 20, background: 'rgba(212,96,74,0.1)', border: '1px solid rgba(212,96,74,0.2)', borderRadius: 10, fontSize: 13, color: '#D4604A' }}>
            Payment was cancelled. Your access remains locked until you subscribe.
          </div>
        )}

        {!cancelled && loading && !autoFailed && (
          <div style={{ padding: '10px 14px', marginBottom: 20, background: 'rgba(196,118,74,0.08)', border: '1px solid rgba(196,118,74,0.2)', borderRadius: 10, fontSize: 13, color: '#C4764A' }}>
            Taking you to Stripe…
          </div>
        )}

        {autoFailed && (
          <div style={{ padding: '10px 14px', marginBottom: 20, background: 'rgba(212,96,74,0.1)', border: '1px solid rgba(212,96,74,0.2)', borderRadius: 10, fontSize: 13, color: '#D4604A' }}>
            Couldn&apos;t open Stripe automatically. Tap the button below to try again.
          </div>
        )}

        {/* Pricing card */}
        <div style={{
          background: 'rgba(196,118,74,0.08)',
          border: '1px solid rgba(196,118,74,0.15)',
          borderRadius: 16,
          padding: '20px 24px',
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 13, color: '#C4764A', fontWeight: 600, marginBottom: 4 }}>AI Daily Premium</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#E8E0D8', letterSpacing: '-1px' }}>
            $6.90
            <span style={{ fontSize: 15, fontWeight: 400, color: '#8A7D70' }}>/month</span>
          </div>
          <div style={{ fontSize: 12, color: '#8A7D70', marginTop: 4 }}>Billed monthly. Cancel anytime.</div>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left' }}>
            {[
              '1:1 Google Calendar mirror',
              'Canvas deadlines + quizzes',
              'AI briefing + proactive nudges',
              'Voice + ⌘K commands',
              'One-tap reschedule',
            ].map((f) => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#D4CBC0' }}>
                <span style={{ color: '#C4764A', fontSize: 14 }}>✓</span> {f}
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleSubscribe}
          disabled={loading}
          style={{
            width: '100%',
            padding: '15px 0',
            background: loading ? 'rgba(196,118,74,0.5)' : '#C4764A',
            color: '#F5F0EB',
            border: 'none',
            borderRadius: 14,
            fontSize: 16,
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            letterSpacing: '-0.3px',
            transition: 'background 0.3s ease',
          }}
        >
          {loading ? 'Redirecting to Stripe...' : 'Start for $6.90/month'}
        </button>

        <div style={{ fontSize: 11, color: '#6B6058', marginTop: 14, lineHeight: 1.6 }}>
          Secure payment via Stripe. You can cancel anytime from Settings.
        </div>
      </div>
    </div>
  );
}

export default function PaywallPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#f3ede1' }} />}>
      <PaywallContent />
    </Suspense>
  );
}
