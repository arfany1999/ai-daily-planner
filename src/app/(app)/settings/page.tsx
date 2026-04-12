'use client';

import { useState, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import PageHeader from '@/components/PageHeader';
import PushToggle from '@/components/PushToggle';
import { T } from '@/lib/theme';

type Domain = { id: string; label: string; icon: string; weight: number; enabled: boolean; color: string };

const DEFAULT_DOMAINS: Domain[] = [
  { id: 'academia', label: 'Academia (RMIT)', icon: '🎓', weight: 5, enabled: true, color: '#4a6ef5' },
  { id: 'dev',      label: 'Dev Projects',    icon: '💻', weight: 4, enabled: true, color: '#0d9b8a' },
  { id: 'finance',  label: 'Finance / Crypto', icon: '📈', weight: 3, enabled: true, color: '#f5a623' },
  { id: 'gym',      label: 'Health / Gym',     icon: '🏋', weight: 3, enabled: true, color: '#27c77a' },
  { id: 'personal', label: 'Personal / Admin', icon: '🏠', weight: 2, enabled: true, color: '#e94f4f' },
];

// Toggle must be defined before any component that uses it
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

function LifeDomainsSection({ domains, onUpdate }: { domains: Domain[]; onUpdate: (d: Domain[]) => void }) {
  const updateDomain = (id: string, patch: Partial<Domain>) => {
    onUpdate(domains.map(d => d.id === id ? { ...d, ...patch } : d));
  };
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18, marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textMuted, marginBottom: 4 }}>
        Life Domains
      </div>
      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
        AI weights these when building your schedule. Higher = scheduled first.
      </div>
      {domains.map((d) => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${T.border}` }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>{d.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: d.enabled ? T.text : T.textMuted, marginBottom: 4 }}>{d.label}</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1,2,3,4,5].map(w => (
                <button key={w} onClick={() => updateDomain(d.id, { weight: w })} style={{
                  width: 18, height: 18, borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: w <= d.weight ? d.color : 'rgba(0,0,0,0.08)',
                  transition: 'all 0.15s', opacity: d.enabled ? 1 : 0.4,
                }} />
              ))}
              <span style={{ fontSize: 10, color: T.textMuted, marginLeft: 4, alignSelf: 'center' }}>{d.weight}/5</span>
            </div>
          </div>
          <Toggle on={d.enabled} onChange={() => updateDomain(d.id, { enabled: !d.enabled })} color={d.color} />
        </div>
      ))}
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
  const [conns, setConns] = useState({ google: true, gmail: true, canvas: false });

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => setSettings(d))
      .catch(() => {});

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

      {/* Schedule settings — editable */}
      {(() => {
        const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const workDays = (settings.work_days as string[] | undefined) || [];
        const gymDays = (settings.gym_days as string[] | undefined) || [];
        const toggleDay = (list: string[], day: string, key: string) => {
          const next = list.includes(day) ? list.filter(d => d !== day) : [...list, day];
          updateSetting(key, next);
        };
        const inputStyle: React.CSSProperties = {
          padding: '6px 10px', borderRadius: 8, border: `1px solid ${T.border}`,
          background: T.bg, color: T.text, fontSize: 12, width: 80, outline: 'none',
        };
        return (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textMuted, marginBottom: 14 }}>
              Schedule
            </div>

            {/* Work days */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: T.textSoft, marginBottom: 8 }}>Work days</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {ALL_DAYS.map(d => {
                  const on = workDays.includes(d);
                  return (
                    <button key={d} onClick={() => toggleDay(workDays, d, 'work_days')} style={{
                      padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                      background: on ? T.teal + '20' : 'rgba(0,0,0,0.06)',
                      color: on ? T.teal : T.textMuted,
                      outline: on ? `1.5px solid ${T.tealBrd}` : 'none',
                      transition: 'all 0.15s',
                    }}>{d}</button>
                  );
                })}
              </div>
            </div>

            {/* Work hours */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: T.textSoft, width: 80, flexShrink: 0 }}>Work hours</span>
              <input type="time" value={(settings.work_start as string) || '09:00'} onChange={e => updateSetting('work_start', e.target.value)} style={inputStyle} />
              <span style={{ fontSize: 12, color: T.textMuted }}>to</span>
              <input type="time" value={(settings.work_end as string) || '17:00'} onChange={e => updateSetting('work_end', e.target.value)} style={inputStyle} />
            </div>

            {/* Gym days */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: T.textSoft, marginBottom: 8 }}>Gym days</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {ALL_DAYS.map(d => {
                  const on = gymDays.includes(d);
                  return (
                    <button key={d} onClick={() => toggleDay(gymDays, d, 'gym_days')} style={{
                      padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                      background: on ? '#27c77a20' : 'rgba(0,0,0,0.06)',
                      color: on ? '#27c77a' : T.textMuted,
                      outline: on ? '1.5px solid #27c77a40' : 'none',
                      transition: 'all 0.15s',
                    }}>{d}</button>
                  );
                })}
              </div>
            </div>

            {/* Gym hours */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: T.textSoft, width: 80, flexShrink: 0 }}>Gym hours</span>
              <input type="time" value={(settings.gym_start as string) || '18:00'} onChange={e => updateSetting('gym_start', e.target.value)} style={inputStyle} />
              <span style={{ fontSize: 12, color: T.textMuted }}>to</span>
              <input type="time" value={(settings.gym_end as string) || '19:30'} onChange={e => updateSetting('gym_end', e.target.value)} style={inputStyle} />
            </div>
          </div>
        );
      })()}

      {/* Appearance */}
      <div style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: 14,
        padding: 18, marginBottom: 12,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textMuted, marginBottom: 12 }}>
          Appearance
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Dark Mode</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>Switch to dark theme for evening use</div>
          </div>
          <Toggle
            on={(() => { try { return localStorage.getItem('ai-planner-dark') === '1'; } catch { return false; } })()}
            onChange={() => {
              const isDark = document.body.classList.toggle('dark');
              try { localStorage.setItem('ai-planner-dark', isDark ? '1' : '0'); } catch {}
            }}
            color={T.teal}
          />
        </div>
      </div>

      {/* Notifications */}
      <div style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: 14,
        padding: 18, marginBottom: 12,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textMuted, marginBottom: 12 }}>
          Notifications
        </div>
        <div style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(74,110,245,0.07)', border: '1px solid rgba(74,110,245,0.15)', fontSize: 11, color: T.teal, lineHeight: 1.5 }}>
          Enable push to receive your morning briefing at 7am, deadline alerts, and schedule reminders.
        </div>
        <PushToggle />
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { key: 'email_briefing', label: 'Email: Weekly briefing' },
            { key: 'email_todo', label: 'Email: Tomorrow\'s to-do' },
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
      </div>

      {/* Life Domains */}
      <LifeDomainsSection
        domains={(settings.domains as typeof DEFAULT_DOMAINS) || DEFAULT_DOMAINS}
        onUpdate={(updated) => updateSetting('domains', updated)}
      />

      {/* Agentic Mode */}
      <div style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: 14,
        padding: 18, marginBottom: 12,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textMuted, marginBottom: 12 }}>
          AI Mode
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 0', borderBottom: `1px solid ${T.border}`,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Agentic Auto-Mode</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2, lineHeight: 1.5 }}>
              AI auto-creates study blocks, reschedules on conflicts, and flags urgent deadlines without asking
            </div>
          </div>
          <Toggle
            on={Boolean(settings.agentic_mode)}
            onChange={() => updateSetting('agentic_mode', !settings.agentic_mode)}
            color={T.blue}
          />
        </div>
        <div style={{ fontSize: 10, color: T.textMuted, marginTop: 8, lineHeight: 1.6 }}>
          {settings.agentic_mode
            ? '⚡ Auto mode: AI executes safe actions automatically. Sensitive actions (deleting events, rescheduling fixed appointments) still ask first.'
            : '💬 Suggest mode: AI proposes changes and you approve each one before anything happens.'}
        </div>
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
