'use client';

import { useState, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import PageHeader from '@/components/PageHeader';
import { T } from '@/lib/theme';

function Toggle({ on, onChange, color }: { on: boolean; onChange: () => void; color: string }) {
  return (
    <div onClick={onChange} style={{
      width: 40, height: 22, borderRadius: 11,
      background: on ? color + '40' : T.bg3,
      border: `1px solid ${on ? color + '60' : T.border}`,
      cursor: 'pointer', position: 'relative', transition: 'all 0.3s', flexShrink: 0,
    }}>
      <div style={{
        width: 16, height: 16, borderRadius: '50%',
        background: on ? color : '#555',
        position: 'absolute', top: 2, left: on ? 21 : 3,
        transition: 'all 0.3s cubic-bezier(0.22,1,0.36,1)',
        boxShadow: on ? `0 0 8px ${color}40` : 'none',
      }} />
    </div>
  );
}

function CanvasTokenEntry({ onConnected }: { onConnected: () => void }) {
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const r = await fetch('/api/settings/canvas-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const d = await r.json();
      if (d.success) {
        setToken('');
        onConnected();
      } else {
        setError(d.error || 'Failed');
      }
    } catch {
      setError('Network error');
    }
    setSaving(false);
  };

  return (
    <div style={{
      background: T.card, border: `1px solid ${T.blue}20`, borderRadius: 14,
      padding: 18, marginBottom: 12,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.blue, marginBottom: 8 }}>
        Connect Canvas
      </div>
      <div style={{ fontSize: 11, color: T.textSoft, fontWeight: 300, marginBottom: 10, lineHeight: 1.6 }}>
        Go to rmit.instructure.com &gt; Account &gt; Settings &gt; New Access Token
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={token} onChange={(e) => setToken(e.target.value)}
          type="password" placeholder="Paste Canvas API token..."
          style={{
            flex: 1, padding: '9px 12px', background: T.bg, border: `1px solid ${T.border}`,
            borderRadius: 8, color: T.text, fontSize: 12, outline: 'none',
          }}
        />
        <button onClick={save} disabled={saving || !token.trim()} style={{
          padding: '9px 16px',
          background: token.trim() ? `linear-gradient(135deg,${T.tealDk},${T.teal})` : '#333',
          color: token.trim() ? '#fff' : '#666',
          border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: token.trim() ? 'pointer' : 'default',
        }}>
          {saving ? 'Validating...' : 'Connect'}
        </button>
      </div>
      {error && <div style={{ marginTop: 8, fontSize: 10, color: T.red }}>{error}</div>}
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [conns, setConns] = useState({ google: true, gmail: true, canvas: false });

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => { setSettings(d); setLoading(false); })
      .catch(() => setLoading(false));

    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => {
        setConns({
          google: d.checks?.google?.status === 'ok',
          gmail: d.checks?.google?.status === 'ok',
          canvas: d.checks?.canvas?.status === 'ok',
        });
      })
      .catch(() => {});
  }, []);

  const updateSetting = async (key: string, value: unknown) => {
    setSettings((s) => ({ ...s, [key]: value }));
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
  };

  if (loading) {
    return (
      <div style={{ padding: '0 18px' }}>
        <PageHeader title="Settings" />
        <div style={{ textAlign: 'center', padding: 40, color: T.textMuted }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 18px' }}>
      <PageHeader title="Settings" subtitle="Connections & preferences" />

      {/* Connections */}
      <div style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: 14,
        padding: 18, marginBottom: 12,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textMuted, marginBottom: 12 }}>
          Built-in connections
        </div>
        {[
          { key: 'google', label: 'Google Calendar', desc: 'Calendar events + scheduling', icon: '📅', connected: conns.google },
          { key: 'gmail', label: 'Gmail', desc: 'Email highlights in briefings', icon: '📧', connected: conns.gmail },
          { key: 'canvas', label: 'RMIT Canvas', desc: 'Assignments, announcements, files', icon: '🎓', connected: conns.canvas },
        ].map((c) => (
          <div key={c.key} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 0', borderBottom: `1px solid ${T.border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>{c.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{c.label}</div>
                <div style={{ fontSize: 11, color: T.textSoft, fontWeight: 300 }}>{c.desc}</div>
              </div>
            </div>
            <div style={{
              fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 5,
              background: c.connected ? T.green + '15' : T.yellow + '15',
              color: c.connected ? T.green : T.yellow,
            }}>
              {c.connected ? 'Connected' : 'Not connected'}
            </div>
          </div>
        ))}
      </div>

      {/* Canvas token entry (if not connected) */}
      {!conns.canvas && (
        <CanvasTokenEntry onConnected={() => setConns((c) => ({ ...c, canvas: true }))} />
      )}

      {/* Schedule settings */}
      <div style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: 14,
        padding: 18, marginBottom: 12,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textMuted, marginBottom: 12 }}>
          Schedule
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: T.textSoft }}>Work days</span>
            <span style={{ fontSize: 12, color: T.text }}>{(settings.work_days as string[] || []).join(', ')}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: T.textSoft }}>Work hours</span>
            <span style={{ fontSize: 12, color: T.text }}>{settings.work_start as string} - {settings.work_end as string}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: T.textSoft }}>Gym days</span>
            <span style={{ fontSize: 12, color: T.text }}>{(settings.gym_days as string[] || []).join(', ')}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: T.textSoft }}>Gym hours</span>
            <span style={{ fontSize: 12, color: T.text }}>{settings.gym_start as string} - {settings.gym_end as string}</span>
          </div>
        </div>
      </div>

      {/* Notification settings */}
      <div style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: 14,
        padding: 18, marginBottom: 12,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textMuted, marginBottom: 12 }}>
          Notifications
        </div>
        {[
          { key: 'email_briefing', label: 'Email: Weekly briefing' },
          { key: 'email_todo', label: 'Email: Tomorrow\'s to-do' },
          { key: 'email_weekly', label: 'Email: Weekly summary' },
          { key: 'push_notifications', label: 'Push notifications' },
        ].map((item) => (
          <div key={item.key} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 0',
          }}>
            <span style={{ fontSize: 12, color: T.textSoft }}>{item.label}</span>
            <Toggle
              on={Boolean(settings[item.key])}
              onChange={() => updateSetting(item.key, !settings[item.key])}
              color={T.teal}
            />
          </div>
        ))}
      </div>

      {/* Sign out */}
      <button
        onClick={() => signOut({ callbackUrl: '/' })}
        style={{
          width: '100%', padding: '12px 0', marginTop: 8,
          background: T.red + '0c', color: T.red,
          border: `1px solid ${T.red}18`, borderRadius: 10,
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>
        Sign out
      </button>

      {/* Delete account */}
      <button
        onClick={async () => {
          if (window.confirm('Delete your account? This permanently removes ALL your data and cannot be undone.')) {
            if (window.confirm('Are you absolutely sure? This action is irreversible.')) {
              await fetch('/api/account/delete', { method: 'POST' });
              signOut({ callbackUrl: '/' });
            }
          }
        }}
        style={{
          width: '100%', padding: '10px 0', marginTop: 6,
          background: 'transparent', color: T.textMuted,
          border: `1px solid ${T.border}`, borderRadius: 10,
          fontSize: 11, fontWeight: 400, cursor: 'pointer',
        }}>
        Delete account and all data
      </button>
    </div>
  );
}
