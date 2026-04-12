'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { T } from '@/lib/theme';

export default function Nav() {
  const { data: session } = useSession();
  const initial = session?.user?.name?.[0] || session?.user?.email?.[0]?.toUpperCase() || 'H';
  const [notifCount, setNotifCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<{ title: string; course?: string; type: 'deadline' | 'announcement' }[]>([]);

  useEffect(() => {
    fetch('/api/canvas')
      .then(r => r.json())
      .then(d => {
        const items: typeof notifs = [];
        // Overdue / soon deadlines
        (d.data?.assignments || []).forEach((a: { name: string; course_name: string; due_at: string | null; has_submitted_submissions: boolean }) => {
          if (a.has_submitted_submissions || !a.due_at) return;
          const days = Math.ceil((new Date(a.due_at).getTime() - Date.now()) / 86400000);
          if (days <= 3) items.push({ title: a.name, course: a.course_name, type: 'deadline' });
        });
        // Recent announcements (last 3)
        (d.data?.announcements || []).slice(0, 3).forEach((a: { title: string; course_name: string }) => {
          items.push({ title: a.title, course: a.course_name, type: 'announcement' });
        });
        setNotifs(items.slice(0, 8));
        setNotifCount(items.length);
      }).catch(() => {});
  }, []);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 20px',
      background: 'rgba(243,237,225,0.82)',
      borderBottom: `1px solid rgba(0,0,0,0.06)`,
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      <Link href="/home" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: `linear-gradient(135deg,${T.tealDk},${T.teal})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: '#fff',
          boxShadow: `0 3px 10px ${T.tealGlow}`,
        }}>A</div>
        <span style={{ fontSize: 17, fontWeight: 700, color: T.text, letterSpacing: '-0.5px' }}>AI Planner</span>
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {[{ label: 'Progress', href: '/progress' }, { label: 'Settings', href: '/settings' }].map((l) => (
          <Link key={l.label} href={l.href} style={{
            fontSize: 12, color: T.textMuted, cursor: 'pointer',
            padding: '5px 10px', borderRadius: 8,
            fontWeight: 500, textDecoration: 'none',
          }}>{l.label}</Link>
        ))}

        {/* Notification bell */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setNotifOpen(o => !o)} style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(255,255,255,0.5)', border: `1px solid ${T.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', position: 'relative',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke={notifCount > 0 ? T.teal : T.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {notifCount > 0 && (
              <div style={{
                position: 'absolute', top: -3, right: -3,
                width: 14, height: 14, borderRadius: '50%',
                background: T.red, color: '#fff',
                fontSize: 8, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{notifCount > 9 ? '9+' : notifCount}</div>
            )}
          </button>

          {notifOpen && (
            <div style={{
              position: 'absolute', top: 36, right: 0, width: 280, zIndex: 300,
              background: 'rgba(243,237,225,0.98)', backdropFilter: 'blur(16px)',
              borderRadius: 14, border: `1px solid ${T.border}`,
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
              overflow: 'hidden',
            }}>
              <div style={{ padding: '10px 14px 6px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>
                Alerts
              </div>
              {notifs.length === 0 ? (
                <div style={{ padding: '16px 14px', fontSize: 12, color: T.textMuted, textAlign: 'center' }}>All clear ✓</div>
              ) : notifs.map((n, i) => (
                <div key={i} style={{ padding: '8px 14px', borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 12, flexShrink: 0 }}>{n.type === 'deadline' ? '⚠️' : '📣'}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</div>
                    {n.course && <div style={{ fontSize: 10, color: T.textMuted }}>{n.course}</div>}
                  </div>
                </div>
              ))}
              <button onClick={() => setNotifOpen(false)} style={{
                width: '100%', padding: '8px', border: 'none', background: 'transparent',
                fontSize: 11, color: T.textMuted, cursor: 'pointer',
              }}>Dismiss</button>
            </div>
          )}
        </div>

        <div style={{
          width: 30, height: 30, borderRadius: '50%',
          background: `linear-gradient(135deg,${T.tealDk},${T.teal})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 600, color: '#fff',
          boxShadow: `0 2px 8px ${T.tealGlow}`,
        }}>{initial}</div>
      </div>
    </div>
  );
}
