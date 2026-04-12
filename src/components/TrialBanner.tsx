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
      background: urgent ? 'rgba(229,77,77,0.08)' : 'rgba(74,110,245,0.06)',
      borderBottom: `1px solid ${urgent ? 'rgba(229,77,77,0.15)' : 'rgba(74,110,245,0.12)'}`,
      padding: '8px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      fontSize: 12,
    }}>
      <span style={{ color: urgent ? '#c0392b' : '#4a6ef5', fontWeight: 500 }}>
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
            background: urgent ? '#e54d4d' : '#4a6ef5',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? '...' : 'Subscribe — $16.99/mo'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          style={{ background: 'none', border: 'none', color: '#a09880', fontSize: 14, cursor: 'pointer', padding: 0, lineHeight: 1 }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
