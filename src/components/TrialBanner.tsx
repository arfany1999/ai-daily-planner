'use client';

import { useState } from 'react';

export default function TrialBanner({ daysLeft }: { daysLeft: number }) {
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);

  if (dismissed) return null;

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

  const urgent = daysLeft <= 2;

  return (
    <div style={{
      background: urgent ? 'rgba(212,96,74,0.1)' : 'rgba(196,118,74,0.08)',
      borderBottom: `1px solid ${urgent ? 'rgba(212,96,74,0.2)' : 'rgba(196,118,74,0.15)'}`,
      padding: '8px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      fontSize: 12,
    }}>
      <span style={{ color: urgent ? '#D4604A' : '#C4764A', fontWeight: 500 }}>
        {daysLeft === 1
          ? 'Last day of your free trial.'
          : `${daysLeft} days left in your free trial.`}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          onClick={handleSubscribe}
          disabled={loading}
          style={{
            padding: '4px 12px',
            background: urgent ? '#D4604A' : '#C4764A',
            color: '#F5F0EB',
            border: 'none',
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? '...' : 'Subscribe — $6.99/mo'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          style={{ background: 'none', border: 'none', color: '#6B6058', fontSize: 14, cursor: 'pointer', padding: 0, lineHeight: 1 }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
