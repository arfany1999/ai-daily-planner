'use client';

import { useState, useEffect, useCallback } from 'react';
import { T } from '@/lib/theme';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export default function PushToggle() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkSubscription = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setLoading(false);
      return;
    }
    setSupported(true);

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setEnabled(!!sub);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { checkSubscription(); }, [checkSubscription]);

  const toggle = async () => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;

      if (enabled) {
        // Unsubscribe
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch('/api/push', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setEnabled(false);
      } else {
        // Subscribe
        const res = await fetch('/api/push');
        const { publicKey } = await res.json();
        if (!publicKey) throw new Error('Push not configured');

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
        });

        await fetch('/api/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        });
        setEnabled(true);
      }
    } catch (err) {
      console.error('Push toggle failed:', err);
    }
    setLoading(false);
  };

  if (!supported) return null;

  return (
    <div
      onClick={toggle}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderRadius: 14,
        background: 'rgba(255,255,255,0.52)', border: '1px solid rgba(255,255,255,0.82)',
        cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Push Notifications</div>
        <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
          Morning briefing, deadline alerts, schedule updates
        </div>
      </div>
      <div style={{
        width: 44, height: 24, borderRadius: 12,
        background: enabled ? T.teal : 'rgba(0,0,0,0.12)',
        position: 'relative', transition: 'background 0.25s',
        flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute', top: 2, left: enabled ? 22 : 2,
          width: 20, height: 20, borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        }} />
      </div>
    </div>
  );
}
