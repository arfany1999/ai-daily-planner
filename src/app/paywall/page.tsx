'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function PaywallContent() {
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const cancelled = searchParams.get('cancelled');

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f3ede1',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        background: 'rgba(255,255,255,0.65)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 24,
        border: '1px solid rgba(255,255,255,0.9)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.08)',
        padding: '48px 36px',
        textAlign: 'center',
      }}>
        <img
          src="/icons/icon-source.jpg"
          alt="AI Daily"
          style={{ width: 64, height: 64, borderRadius: 16, objectFit: 'cover', marginBottom: 20, boxShadow: '0 6px 20px rgba(74,110,245,0.2)' }}
        />

        <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1510', letterSpacing: '-0.5px', marginBottom: 8 }}>
          Your free trial has ended
        </div>
        <div style={{ fontSize: 14, color: '#6b6358', marginBottom: 32, lineHeight: 1.6 }}>
          Subscribe to keep your schedule, AI briefings, Canvas sync, and everything else running.
        </div>

        {cancelled && (
          <div style={{ padding: '10px 14px', marginBottom: 20, background: 'rgba(229,77,77,0.08)', border: '1px solid rgba(229,77,77,0.2)', borderRadius: 10, fontSize: 13, color: '#e54d4d' }}>
            Payment was cancelled. Your access remains locked until you subscribe.
          </div>
        )}

        {/* Pricing card */}
        <div style={{
          background: 'rgba(74,110,245,0.06)',
          border: '1px solid rgba(74,110,245,0.15)',
          borderRadius: 16,
          padding: '20px 24px',
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 13, color: '#4a6ef5', fontWeight: 600, marginBottom: 4 }}>AI Daily Premium</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#1a1510', letterSpacing: '-1px' }}>
            $16.99
            <span style={{ fontSize: 15, fontWeight: 400, color: '#6b6358' }}>/month</span>
          </div>
          <div style={{ fontSize: 12, color: '#a09880', marginTop: 4 }}>Billed monthly. Cancel anytime.</div>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left' }}>
            {[
              'AI-generated daily schedule',
              'Google Calendar + Gmail sync',
              'Canvas deadlines + announcements',
              'Cross-referenced intelligence alerts',
              'Real-time updates via webhooks',
            ].map((f) => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#3d3530' }}>
                <span style={{ color: '#4a6ef5', fontSize: 14 }}>✓</span> {f}
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
            background: loading ? 'rgba(74,110,245,0.5)' : 'linear-gradient(135deg,#5b7fff,#4a6ef5)',
            color: '#fff',
            border: 'none',
            borderRadius: 14,
            fontSize: 16,
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: loading ? 'none' : '0 6px 24px rgba(74,110,245,0.35)',
            letterSpacing: '-0.3px',
          }}
        >
          {loading ? 'Redirecting to Stripe...' : 'Start for $16.99/month'}
        </button>

        <div style={{ fontSize: 11, color: '#a09880', marginTop: 14, lineHeight: 1.6 }}>
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
