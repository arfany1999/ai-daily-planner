'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { T } from '@/lib/theme';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

function Toggle({ on, onChange, color }: { on: boolean; onChange: () => void; color: string }) {
  return (
    <div onClick={onChange} style={{
      width: 44, height: 24, borderRadius: 12,
      background: on ? color + '40' : T.bg3,
      border: `1px solid ${on ? color + '60' : T.border}`,
      cursor: 'pointer', position: 'relative', transition: 'all 0.3s', flexShrink: 0,
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%',
        background: on ? color : '#555',
        position: 'absolute', top: 2, left: on ? 23 : 3,
        transition: 'all 0.3s cubic-bezier(0.22,1,0.36,1)',
        boxShadow: on ? `0 0 8px ${color}40` : 'none',
      }} />
    </div>
  );
}

export default function SetupPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Step 0: Connections
  const [canvasEnabled, setCanvasEnabled] = useState(false);
  const [canvasToken, setCanvasToken] = useState('');
  const [canvasStatus, setCanvasStatus] = useState<'idle' | 'validating' | 'success' | 'error'>('idle');
  const [canvasError, setCanvasError] = useState('');
  const [canvasUser, setCanvasUser] = useState('');

  // Step 1: Schedule
  const [workDays, setWorkDays] = useState<string[]>(['saturday', 'sunday']);
  const [workStart, setWorkStart] = useState('09:00');
  const [workEnd, setWorkEnd] = useState('18:30');
  const [gymDays, setGymDays] = useState<string[]>(['monday', 'wednesday', 'thursday', 'sunday']);
  const [gymStart, setGymStart] = useState('19:00');
  const [gymEnd, setGymEnd] = useState('21:00');

  const [saving, setSaving] = useState(false);
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const firstName = session?.user?.name?.split(' ')[0] || 'there';

  // Check whether Google Calendar is already connected (email/password users land
  // here without tokens; Google-signed-in users already have them).
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setGoogleConnected(d?.checks?.google?.status === 'ok'))
      .catch(() => setGoogleConnected(false));
  }, []);

  // Auto-validate Canvas token
  const validateCanvas = useCallback(async (token: string) => {
    if (!token.trim() || token.trim().length < 10) return;
    setCanvasStatus('validating');
    setCanvasError('');
    try {
      const r = await fetch('/api/settings/canvas-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });
      const d = await r.json();
      if (d.success) {
        setCanvasStatus('success');
        setCanvasUser(d.user?.name || d.user?.email || 'Verified');
      } else {
        setCanvasStatus('error');
        setCanvasError(d.error || 'Invalid token');
      }
    } catch {
      setCanvasStatus('error');
      setCanvasError('Network error');
    }
  }, []);

  useEffect(() => {
    if (!canvasToken.trim() || canvasToken.trim().length < 10) {
      if (canvasStatus !== 'idle') setCanvasStatus('idle');
      return;
    }
    const timer = setTimeout(() => validateCanvas(canvasToken), 800);
    return () => clearTimeout(timer);
  }, [canvasToken, validateCanvas, canvasStatus]);

  const toggleDay = (day: string, list: string[], setList: (d: string[]) => void) => {
    setList(list.includes(day) ? list.filter((d) => d !== day) : [...list, day]);
  };

  const finishSetup = async () => {
    setSaving(true);
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        work_days: workDays, work_start: workStart, work_end: workEnd,
        gym_days: gymDays, gym_start: gymStart, gym_end: gymEnd,
        setup_complete: true,
      }),
    });
    router.push('/home');
  };

  return (
    <div style={{
      minHeight: '100vh', background: T.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 520, background: T.bg2,
        border: `1px solid ${T.border}`, borderRadius: 20,
        padding: '32px 28px', position: 'relative', overflow: 'hidden',
      }}>
        {/* Glow */}
        <div style={{
          position: 'absolute', top: -80, right: -80, width: 200, height: 200,
          borderRadius: '50%', background: `radial-gradient(circle, ${T.teal}15, transparent 70%)`,
          pointerEvents: 'none',
        }} />

        {/* Progress */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 28 }}>
          {[0, 1, 2].map((s) => (
            <div key={s} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: s <= step ? T.teal : T.bg3, transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {/* ──── Step 0: Welcome + Connections ──── */}
        {step === 0 && (
          <>
            <div style={{
              fontSize: 24, fontWeight: 700,
              background: `linear-gradient(135deg, ${T.teal}, ${T.blue})`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              marginBottom: 6,
            }}>Welcome, {firstName}!</div>
            <div style={{ fontSize: 13, color: T.textSoft, fontWeight: 300, lineHeight: 1.7, marginBottom: 24 }}>
              {googleConnected
                ? 'Your Google Calendar is connected. Optionally connect your university below.'
                : 'Connect your Google Calendar so AI Planner can mirror your schedule. Optionally connect your university below.'}
            </div>

            {/* Google — Connect or Connected */}
            <div style={{
              padding: '14px 18px', background: T.card,
              border: `1px solid ${googleConnected ? T.green + '20' : T.tealBrd}`,
              borderRadius: 12, marginBottom: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 20 }}>📅</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Google Calendar</div>
                  <div style={{ fontSize: 11, color: T.textSoft, fontWeight: 300 }}>
                    {googleConnected ? (session?.user?.email || 'Connected') : '1:1 mirror of your schedule'}
                  </div>
                </div>
              </div>
              {googleConnected ? (
                <span style={{ fontSize: 10, fontWeight: 600, color: T.green, background: T.green + '15', padding: '4px 10px', borderRadius: 6 }}>✓ Connected</span>
              ) : (
                <a href="/api/auth/google-connect" style={{
                  fontSize: 11, fontWeight: 600, color: '#fff', textDecoration: 'none',
                  background: `linear-gradient(135deg,${T.tealDk},${T.teal})`,
                  padding: '6px 12px', borderRadius: 7,
                }}>Connect</a>
              )}
            </div>

            {/* Canvas — optional toggle */}
            <div style={{
              padding: '14px 18px', background: T.card,
              border: `1px solid ${canvasStatus === 'success' ? T.green + '20' : canvasEnabled ? T.blue + '20' : T.border}`,
              borderRadius: 12, marginBottom: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: canvasEnabled ? 12 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 20 }}>🎓</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>RMIT Canvas</div>
                    <div style={{ fontSize: 11, color: T.textSoft, fontWeight: 300 }}>Assignments, announcements, files</div>
                  </div>
                </div>
                <Toggle on={canvasEnabled} onChange={() => setCanvasEnabled(!canvasEnabled)} color={T.blue} />
              </div>

              {canvasEnabled && (
                <div>
                  <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 300, lineHeight: 1.6, marginBottom: 8 }}>
                    Go to <span style={{ color: T.blue }}>rmit.instructure.com</span> → Account → Settings → New Access Token
                  </div>
                  <input
                    value={canvasToken}
                    onChange={(e) => setCanvasToken(e.target.value)}
                    type="password"
                    placeholder="Paste your Canvas API token..."
                    style={{
                      width: '100%', padding: '10px 14px', background: T.bg,
                      border: `1px solid ${canvasStatus === 'success' ? T.green + '50' : canvasStatus === 'error' ? T.red + '50' : T.border}`,
                      borderRadius: 8, color: T.text, fontSize: 12, outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                  {canvasStatus === 'validating' && (
                    <div style={{ marginTop: 6, fontSize: 11, color: T.yellow }}>Verifying token...</div>
                  )}
                  {canvasStatus === 'success' && (
                    <div style={{ marginTop: 6, fontSize: 11, color: T.green }}>✓ Connected as {canvasUser}</div>
                  )}
                  {canvasStatus === 'error' && (
                    <div style={{ marginTop: 6, fontSize: 11, color: T.red }}>{canvasError}</div>
                  )}
                </div>
              )}
            </div>

            <button onClick={() => setStep(1)} style={{
              width: '100%', padding: '13px 0',
              background: `linear-gradient(135deg,${T.tealDk},${T.teal})`,
              color: '#fff', border: 'none', borderRadius: 10,
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>Continue</button>
          </>
        )}

        {/* ──── Step 1: Schedule ──── */}
        {step === 1 && (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 4 }}>Your schedule</div>
            <div style={{ fontSize: 13, color: T.textSoft, fontWeight: 300, lineHeight: 1.7, marginBottom: 20 }}>
              AI uses this to avoid scheduling study sessions over your work and gym.
            </div>

            <div style={{ padding: '16px 18px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 10 }}>Work days</div>
              <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
                {DAYS.map((d) => (
                  <button key={d} onClick={() => toggleDay(d, workDays, setWorkDays)} style={{
                    flex: 1, padding: '8px 0', borderRadius: 7, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                    background: workDays.includes(d) ? T.teal + '20' : 'transparent',
                    border: `1px solid ${workDays.includes(d) ? T.tealBrd : T.border}`,
                    color: workDays.includes(d) ? T.teal : T.textMuted,
                  }}>{DAY_LABELS[d]}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4 }}>Start</div>
                  <input value={workStart} onChange={(e) => setWorkStart(e.target.value)} type="time"
                    style={{ width: '100%', padding: '8px 10px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontSize: 12, outline: 'none' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4 }}>End</div>
                  <input value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} type="time"
                    style={{ width: '100%', padding: '8px 10px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontSize: 12, outline: 'none' }} />
                </div>
              </div>
            </div>

            <div style={{ padding: '16px 18px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 10 }}>Gym days</div>
              <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
                {DAYS.map((d) => (
                  <button key={d} onClick={() => toggleDay(d, gymDays, setGymDays)} style={{
                    flex: 1, padding: '8px 0', borderRadius: 7, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                    background: gymDays.includes(d) ? T.purple + '20' : 'transparent',
                    border: `1px solid ${gymDays.includes(d) ? T.purple + '40' : T.border}`,
                    color: gymDays.includes(d) ? T.purple : T.textMuted,
                  }}>{DAY_LABELS[d]}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4 }}>Start</div>
                  <input value={gymStart} onChange={(e) => setGymStart(e.target.value)} type="time"
                    style={{ width: '100%', padding: '8px 10px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontSize: 12, outline: 'none' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4 }}>End</div>
                  <input value={gymEnd} onChange={(e) => setGymEnd(e.target.value)} type="time"
                    style={{ width: '100%', padding: '8px 10px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontSize: 12, outline: 'none' }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep(0)} style={{
                padding: '12px 20px', background: T.bg3, color: T.textSoft,
                border: `1px solid ${T.border}`, borderRadius: 10, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              }}>Back</button>
              <button onClick={() => setStep(2)} style={{
                flex: 1, padding: '12px 0',
                background: `linear-gradient(135deg,${T.tealDk},${T.teal})`,
                color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>Continue</button>
            </div>
          </>
        )}

        {/* ──── Step 2: Done ──── */}
        {step === 2 && (
          <>
            <div style={{
              fontSize: 24, fontWeight: 700,
              background: `linear-gradient(135deg, ${T.teal}, ${T.blue})`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              marginBottom: 6,
            }}>You&apos;re all set!</div>
            <div style={{ fontSize: 13, color: T.textSoft, fontWeight: 300, lineHeight: 1.7, marginBottom: 20 }}>
              Everything can be changed later in Settings. Custom connections (websites, RSS, APIs) can be added from the dashboard.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              <div style={{
                padding: '12px 16px', background: T.card, border: `1px solid ${T.border}`,
                borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>📅</span>
                  <span style={{ fontSize: 13, color: T.text }}>Google Calendar</span>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 5,
                  color: googleConnected ? T.green : T.textMuted,
                  background: googleConnected ? T.green + '15' : T.bg3,
                }}>{googleConnected ? '✓ Connected' : 'Not connected'}</span>
              </div>

              <div style={{
                padding: '12px 16px', background: T.card, border: `1px solid ${T.border}`,
                borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>🎓</span>
                  <span style={{ fontSize: 13, color: T.text }}>RMIT Canvas</span>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 5,
                  color: canvasStatus === 'success' ? T.green : T.textMuted,
                  background: canvasStatus === 'success' ? T.green + '15' : T.bg3,
                }}>{canvasStatus === 'success' ? '✓ Connected' : 'Not connected'}</span>
              </div>

              <div style={{ padding: '12px 16px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 10 }}>
                <div style={{ fontSize: 12, color: T.text, marginBottom: 4 }}>
                  Work: {workDays.map((d) => DAY_LABELS[d]).join(', ') || 'None'} ({workStart} – {workEnd})
                </div>
                <div style={{ fontSize: 12, color: T.text }}>
                  Gym: {gymDays.map((d) => DAY_LABELS[d]).join(', ') || 'None'} ({gymStart} – {gymEnd})
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep(1)} style={{
                padding: '12px 20px', background: T.bg3, color: T.textSoft,
                border: `1px solid ${T.border}`, borderRadius: 10, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              }}>Back</button>
              <button onClick={finishSetup} disabled={saving} style={{
                flex: 1, padding: '13px 0',
                background: `linear-gradient(135deg,${T.tealDk},${T.teal})`,
                color: '#fff', border: 'none', borderRadius: 10,
                fontSize: 14, fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
                boxShadow: `0 4px 24px ${T.teal}30`,
                opacity: saving ? 0.6 : 1,
              }}>{saving ? 'Setting up...' : 'Go to Dashboard →'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
