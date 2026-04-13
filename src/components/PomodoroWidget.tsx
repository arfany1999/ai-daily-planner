'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { T } from '@/lib/theme';

export default function PomodoroWidget() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [taskName, setTaskName] = useState('Focus');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [duration, setDuration] = useState(25 * 60);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const sessionDbId = useRef<string | null>(null);

  // Expose start method globally — now accepts taskId
  useEffect(() => {
    (window as any).__startPomodoro = (name: string, mins = 25, id?: string) => {
      setTaskName(name);
      setTaskId(id || null);
      setDuration(mins * 60);
      setTimeLeft(mins * 60);
      setRunning(true);
      setVisible(true);

      // Persist session
      fetch('/api/focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_name: name, task_id: id || null, duration_minutes: mins, interval_preset: `${mins}/5` }),
      }).then(r => r.json()).then(d => { if (d.session?.id) sessionDbId.current = d.session.id; }).catch(() => {});
    };
    return () => { delete (window as any).__startPomodoro; };
  }, []);

  useEffect(() => {
    if (running && timeLeft > 0) {
      intervalRef.current = setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else if (timeLeft === 0 && running) {
      setRunning(false);
      setSessions(s => s + 1);
      try { new Notification('Pomodoro done!', { body: taskName }); } catch {}

      // Mark complete in DB
      if (sessionDbId.current) {
        fetch(`/api/focus/${sessionDbId.current}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: true, actual_minutes: Math.round(duration / 60) }),
        }).catch(() => {});
        sessionDbId.current = null;
      }
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, timeLeft, taskName, duration]);

  const reset = () => {
    setRunning(false);
    setTimeLeft(duration);
    // Mark incomplete if session was active
    if (sessionDbId.current) {
      const elapsed = Math.round((duration - timeLeft) / 60);
      fetch(`/api/focus/${sessionDbId.current}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: false, actual_minutes: elapsed }),
      }).catch(() => {});
      sessionDbId.current = null;
    }
  };

  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const secs = String(timeLeft % 60).padStart(2, '0');
  const pct = ((duration - timeLeft) / duration) * 100;

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 90, right: 16, zIndex: 200,
      background: 'rgba(26,26,31,0.96)', backdropFilter: 'blur(20px)',
      borderRadius: 20, padding: '14px 18px', minWidth: 180,
      border: '1px solid rgba(255,255,255,0.1)',
      boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
      animation: 'springIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
    }}>
      <button onClick={() => { setVisible(false); reset(); }} style={{
        position: 'absolute', top: 8, right: 10, background: 'none', border: 'none',
        color: 'rgba(255,255,255,0.4)', fontSize: 16, cursor: 'pointer', lineHeight: 1,
      }}>×</button>

      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
        🍅 Pomodoro
      </div>
      <div style={{ fontSize: 11, color: '#fff', fontWeight: 600, marginBottom: 10, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {taskName}
      </div>

      <div style={{ position: 'relative', width: 80, height: 80, margin: '0 auto 10px' }}>
        <svg width="80" height="80" style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}>
          <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
          <circle cx="40" cy="40" r="34" fill="none" stroke={T.teal} strokeWidth="4"
            strokeDasharray={`${2 * Math.PI * 34}`}
            strokeDashoffset={`${2 * Math.PI * 34 * (1 - pct / 100)}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>{mins}:{secs}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 8 }}>
        <button onClick={() => setRunning(r => !r)} style={{
          flex: 1, padding: '6px 0', borderRadius: 8, border: 'none',
          background: running ? 'rgba(255,255,255,0.12)' : T.teal,
          color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
        }}>{running ? 'Pause' : 'Start'}</button>
        <button onClick={reset} style={{
          padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)',
          background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 11, cursor: 'pointer',
        }}>Reset</button>
      </div>

      {/* Open Focus page link */}
      <button onClick={() => router.push(taskId ? `/focus?task=${taskId}&name=${encodeURIComponent(taskName)}` : '/focus')} style={{
        width: '100%', padding: '5px 0', borderRadius: 6, border: 'none',
        background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)',
        fontSize: 10, cursor: 'pointer', fontWeight: 600,
      }}>Open Focus →</button>

      {sessions > 0 && (
        <div style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
          {'🍅'.repeat(Math.min(sessions, 8))} {sessions} session{sessions !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
