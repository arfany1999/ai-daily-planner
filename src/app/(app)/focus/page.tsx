'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { T } from '@/lib/theme';
import PageHeader from '@/components/PageHeader';

interface FocusSession {
  id: string;
  task_name: string;
  task_id: string | null;
  duration_minutes: number;
  actual_minutes: number | null;
  completed: boolean;
  started_at: string;
  interval_preset: string;
}

interface FocusTask {
  id: string;
  task_name: string;
  urgency: string;
  completed: boolean;
  start_time: string;
}

const PRESETS = [
  { label: '25/5', work: 25, brk: 5 },
  { label: '50/10', work: 50, brk: 10 },
  { label: 'Custom', work: 0, brk: 0 },
];

const SOUNDS = [
  { id: 'rain', label: 'Rain', emoji: '🌧️' },
  { id: 'lofi', label: 'Lo-fi', emoji: '🎵' },
  { id: 'whitenoise', label: 'White Noise', emoji: '📻' },
  { id: 'cafe', label: 'Cafe', emoji: '☕' },
];

// Web Audio noise generator
function createNoise(ctx: AudioContext, type: 'white' | 'brown'): AudioBufferSourceNode {
  const bufferSize = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    if (type === 'brown') {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = white;
    }
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  return src;
}

export default function FocusPage() {
  // Timer state
  const [preset, setPreset] = useState(PRESETS[0]);
  const [customWork, setCustomWork] = useState(30);
  const [customBrk, setCustomBrk] = useState(5);
  const [phase, setPhase] = useState<'idle' | 'work' | 'break'>('idle');
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const durationRef = useRef(25 * 60);
  const sessionIdRef = useRef<string | null>(null);

  // Task linking
  const [tasks, setTasks] = useState<FocusTask[]>([]);
  const [linkedTask, setLinkedTask] = useState<FocusTask | null>(null);
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);

  // Sessions
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [totalMins, setTotalMins] = useState(0);

  // Sounds
  const [activeSound, setActiveSound] = useState<string | null>(null);
  const [soundVol, setSoundVol] = useState(0.5);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioNodeRef = useRef<{ source: AudioBufferSourceNode; gain: GainNode } | null>(null);

  // Load URL params (deep-link from Home)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get('task');
    const taskName = params.get('name');
    if (taskId && taskName) {
      setLinkedTask({ id: taskId, task_name: decodeURIComponent(taskName), urgency: 'green', completed: false, start_time: '' });
    }
  }, []);

  // Load tasks and sessions
  const loadData = useCallback(() => {
    fetch('/api/focus/tasks').then(r => r.json()).then(d => setTasks(d.tasks || [])).catch(() => {});
    fetch('/api/focus').then(r => r.json()).then(d => {
      setSessions(d.sessions || []);
      setTotalMins(d.total_minutes || 0);
    }).catch(() => {});
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Timer effect
  useEffect(() => {
    if (!running || phase === 'idle') return;
    const iv = setInterval(() => {
      if (!startedAtRef.current) return;
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      const left = Math.max(0, durationRef.current - elapsed);
      setTimeLeft(left);
      if (left === 0) {
        clearInterval(iv);
        setRunning(false);
        if (phase === 'work') {
          finishSession();
        } else {
          setPhase('idle');
        }
      }
    }, 250);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, phase]);

  const workMins = preset.label === 'Custom' ? customWork : preset.work;
  const breakMins = preset.label === 'Custom' ? customBrk : preset.brk;

  const startWork = async () => {
    const dur = workMins * 60;
    durationRef.current = dur;
    setTimeLeft(dur);
    startedAtRef.current = Date.now();
    setPhase('work');
    setRunning(true);

    // Create session in DB
    try {
      const res = await fetch('/api/focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_name: linkedTask?.task_name || 'Focus session',
          task_id: linkedTask?.id || null,
          duration_minutes: workMins,
          interval_preset: preset.label,
        }),
      });
      const d = await res.json();
      if (d.session?.id) sessionIdRef.current = d.session.id;
    } catch { /* continue without persistence */ }
  };

  const finishSession = async () => {
    // Mark session complete
    if (sessionIdRef.current) {
      try {
        await fetch(`/api/focus/${sessionIdRef.current}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: true, actual_minutes: workMins }),
        });
      } catch { /* ok */ }
    }
    sessionIdRef.current = null;

    // Notify
    try { new Notification('Focus session complete', { body: `${workMins} minutes of deep work done.` }); } catch { /* ok */ }

    // Start break
    const brkDur = breakMins * 60;
    durationRef.current = brkDur;
    setTimeLeft(brkDur);
    startedAtRef.current = Date.now();
    setPhase('break');
    setRunning(true);
    loadData();
  };

  const togglePause = () => {
    if (running) {
      // Pause — save elapsed
      const elapsed = startedAtRef.current ? Math.floor((Date.now() - startedAtRef.current) / 1000) : 0;
      durationRef.current = Math.max(0, durationRef.current - elapsed);
      startedAtRef.current = null;
      setRunning(false);
    } else if (phase !== 'idle') {
      // Resume
      startedAtRef.current = Date.now();
      setRunning(true);
    }
  };

  const reset = async () => {
    setRunning(false);
    setPhase('idle');
    startedAtRef.current = null;
    setTimeLeft(workMins * 60);
    // Mark incomplete if session was active
    if (sessionIdRef.current) {
      const elapsed = workMins - Math.ceil(timeLeft / 60);
      try {
        await fetch(`/api/focus/${sessionIdRef.current}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: false, actual_minutes: Math.max(0, elapsed) }),
        });
      } catch { /* ok */ }
      sessionIdRef.current = null;
      loadData();
    }
  };

  const skipBreak = () => {
    setRunning(false);
    setPhase('idle');
    startedAtRef.current = null;
    setTimeLeft(workMins * 60);
  };

  // Sound controls
  const toggleSound = (id: string) => {
    // Stop current
    if (audioNodeRef.current) {
      try { audioNodeRef.current.source.stop(); } catch { /* ok */ }
      audioNodeRef.current = null;
    }
    if (activeSound === id) {
      setActiveSound(null);
      return;
    }

    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const gain = ctx.createGain();
    gain.gain.value = soundVol;
    gain.connect(ctx.destination);

    let source: AudioBufferSourceNode;
    if (id === 'rain') {
      source = createNoise(ctx, 'brown');
    } else {
      source = createNoise(ctx, 'white');
    }
    source.connect(gain);
    source.start();
    audioNodeRef.current = { source, gain };
    setActiveSound(id);
  };

  useEffect(() => {
    if (audioNodeRef.current) {
      audioNodeRef.current.gain.gain.value = soundVol;
    }
  }, [soundVol]);

  // Cleanup sounds on unmount
  useEffect(() => {
    return () => {
      if (audioNodeRef.current) {
        try { audioNodeRef.current.source.stop(); } catch { /* ok */ }
      }
    };
  }, []);

  // Timer display
  const mm = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const ss = String(timeLeft % 60).padStart(2, '0');
  const totalSec = phase === 'work' ? workMins * 60 : phase === 'break' ? breakMins * 60 : workMins * 60;
  const progress = totalSec > 0 ? (totalSec - timeLeft) / totalSec : 0;
  const circumference = 2 * Math.PI * 70;
  const dashOffset = circumference * (1 - progress);

  return (
    <div style={{ padding: '0 18px' }}>
      <PageHeader title="Focus" subtitle="Deep work mode" />

      {/* Timer Card */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: '24px 20px', marginBottom: 16, textAlign: 'center' }}>

        {/* Presets */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 20 }}>
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => { if (phase === 'idle') { setPreset(p); setTimeLeft((p.label === 'Custom' ? customWork : p.work) * 60); } }}
              style={{
                padding: '6px 16px', borderRadius: 8, border: 'none', cursor: phase === 'idle' ? 'pointer' : 'default',
                fontSize: 12, fontWeight: preset.label === p.label ? 700 : 500,
                background: preset.label === p.label ? `${T.teal}` : 'transparent',
                color: preset.label === p.label ? '#fff' : T.textMuted,
                opacity: phase !== 'idle' ? 0.5 : 1,
              }}>{p.label}</button>
          ))}
        </div>

        {/* Custom inputs */}
        {preset.label === 'Custom' && phase === 'idle' && (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4 }}>Work</div>
              <input type="number" value={customWork} onChange={e => { setCustomWork(+e.target.value); setTimeLeft(+e.target.value * 60); }} min={5} max={120}
                style={{ width: 56, padding: '6px 8px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg3, color: T.text, fontSize: 14, textAlign: 'center' }} />
              <div style={{ fontSize: 9, color: T.textMuted, marginTop: 2 }}>min</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4 }}>Break</div>
              <input type="number" value={customBrk} onChange={e => setCustomBrk(+e.target.value)} min={1} max={30}
                style={{ width: 56, padding: '6px 8px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg3, color: T.text, fontSize: 14, textAlign: 'center' }} />
              <div style={{ fontSize: 9, color: T.textMuted, marginTop: 2 }}>min</div>
            </div>
          </div>
        )}

        {/* Circular Timer */}
        <div style={{ position: 'relative', width: 180, height: 180, margin: '0 auto 20px' }}>
          <svg width="180" height="180" viewBox="0 0 180 180" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="90" cy="90" r="70" fill="none" stroke={T.bg3} strokeWidth="6" />
            <circle cx="90" cy="90" r="70" fill="none"
              stroke={phase === 'break' ? T.green : T.teal}
              strokeWidth="6" strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 0.3s ease' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: T.text, fontVariantNumeric: 'tabular-nums', letterSpacing: '-2px' }}>{mm}:{ss}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: phase === 'break' ? T.green : phase === 'work' ? T.teal : T.textMuted, marginTop: 2 }}>
              {phase === 'idle' ? 'Ready' : phase === 'work' ? (running ? 'Focusing' : 'Paused') : 'Break'}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 16 }}>
          {phase === 'idle' ? (
            <button onClick={startWork} style={{
              padding: '12px 36px', borderRadius: 12, border: 'none',
              background: `linear-gradient(135deg,${T.tealDk},${T.teal})`, color: '#fff',
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
              boxShadow: `0 4px 16px ${T.tealGlow}`,
            }}>Start Focus</button>
          ) : (
            <>
              <button onClick={togglePause} style={{
                padding: '10px 24px', borderRadius: 10, border: 'none',
                background: running ? T.bg3 : `linear-gradient(135deg,${T.tealDk},${T.teal})`,
                color: running ? T.text : '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>{running ? 'Pause' : 'Resume'}</button>
              <button onClick={reset} style={{
                padding: '10px 20px', borderRadius: 10, border: `1px solid ${T.border}`,
                background: 'transparent', color: T.textMuted, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>Reset</button>
              {phase === 'break' && (
                <button onClick={skipBreak} style={{
                  padding: '10px 16px', borderRadius: 10, border: 'none',
                  background: T.orange, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}>Skip Break</button>
              )}
            </>
          )}
        </div>

        {/* Linked task */}
        {linkedTask ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.teal }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{linkedTask.task_name}</span>
            <button onClick={() => setLinkedTask(null)} style={{ background: 'none', border: 'none', color: T.textMuted, fontSize: 10, cursor: 'pointer' }}>✕</button>
          </div>
        ) : (
          <button onClick={() => setTaskPickerOpen(!taskPickerOpen)} style={{
            background: 'none', border: `1px dashed ${T.border}`, borderRadius: 8, padding: '6px 14px',
            color: T.teal, fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}>Link to a task</button>
        )}
      </div>

      {/* Task Picker */}
      {taskPickerOpen && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textMuted, marginBottom: 8 }}>Today&apos;s Tasks</div>
          {tasks.length === 0 ? (
            <div style={{ fontSize: 12, color: T.textMuted, fontStyle: 'italic', padding: '8px 0' }}>No tasks planned. Start a freeform session.</div>
          ) : tasks.map(t => (
            <div key={t.id} onClick={() => { setLinkedTask(t); setTaskPickerOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8,
                cursor: 'pointer', marginBottom: 2,
                opacity: t.completed ? 0.4 : 1,
                textDecoration: t.completed ? 'line-through' : 'none',
                background: linkedTask?.id === t.id ? `${T.teal}12` : 'transparent',
              }}
              onMouseEnter={e => e.currentTarget.style.background = `${T.teal}08`}
              onMouseLeave={e => e.currentTarget.style.background = linkedTask?.id === t.id ? `${T.teal}12` : 'transparent'}
            >
              <div style={{ width: 4, height: 16, borderRadius: 2, background: t.urgency === 'red' ? T.red : t.urgency === 'amber' ? T.orange : T.green, flexShrink: 0 }} />
              <div style={{ fontSize: 12, color: T.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.task_name}</div>
              <div style={{ fontSize: 9, color: T.textMuted }}>{t.start_time}</div>
            </div>
          ))}
        </div>
      )}

      {/* Ambient Sound Mixer */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.teal, marginBottom: 10 }}>Ambient Sounds</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {SOUNDS.map(s => (
            <button key={s.id} onClick={() => toggleSound(s.id)}
              style={{
                padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                border: activeSound === s.id ? `1px solid ${T.tealBrd}` : `1px solid ${T.border}`,
                background: activeSound === s.id ? `${T.teal}0a` : T.bg3,
                display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
              }}>
              <span style={{ fontSize: 18 }}>{s.emoji}</span>
              <span style={{ fontSize: 12, fontWeight: activeSound === s.id ? 700 : 500, color: activeSound === s.id ? T.teal : T.text }}>{s.label}</span>
            </button>
          ))}
        </div>
        {activeSound && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: T.textMuted }}>Vol</span>
            <input type="range" min="0" max="1" step="0.05" value={soundVol} onChange={e => setSoundVol(+e.target.value)}
              style={{ flex: 1, accentColor: T.teal }} />
          </div>
        )}
      </div>

      {/* Session History */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textMuted, marginBottom: 8 }}>Today&apos;s Sessions</div>
        {sessions.length === 0 ? (
          <div style={{ fontSize: 12, color: T.textMuted, fontStyle: 'italic', padding: '8px 0' }}>No sessions yet. Start your first focus block.</div>
        ) : (
          <>
            {sessions.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 12, color: s.completed ? T.green : T.red }}>{s.completed ? '✓' : '✕'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.task_name}</div>
                </div>
                <span style={{ fontSize: 10, color: T.textMuted }}>{s.actual_minutes || s.duration_minutes} min</span>
                <span style={{ fontSize: 9, color: T.textMuted }}>{new Date(s.started_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
              </div>
            ))}
            <div style={{ marginTop: 8, fontSize: 11, color: T.textSoft, fontWeight: 600 }}>
              Total: {totalMins} min focused across {sessions.length} session{sessions.length !== 1 ? 's' : ''}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
