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
        (d.data?.assignments || []).forEach((a: { name: string; course_name: string; due_at: string | null; has_submitted_submissions: boolean }) => {
          if (a.has_submitted_submissions || !a.due_at) return;
          const days = Math.ceil((new Date(a.due_at).getTime() - Date.now()) / 86400000);
          if (days <= 3) items.push({ title: a.name, course: a.course_name, type: 'deadline' });
        });
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
      padding: '12px 16px',
      background: 'var(--glass-hi)',
      borderBottom: '1px solid var(--border)',
      backdropFilter: 'blur(32px) saturate(1.8)',
      WebkitBackdropFilter: 'blur(32px) saturate(1.8)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      <Link href="/home" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
        <div style={{
          width: 30, height: 30, borderRadius: 9,
          background: `linear-gradient(135deg, var(--teal-dk), var(--teal-lt))`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 800, color: '#fff',
          boxShadow: '0 0 14px var(--teal-glow), inset 0 1px 0 rgba(255,255,255,0.2)',
          flexShrink: 0,
        }}>◈</div>
        <div>
          <span className="title-display" style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: '-0.03em' }}>Commander</span>
          <span style={{ fontSize: 9, color: T.textFaint, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', marginLeft: 6 }}>v3</span>
        </div>
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Search trigger */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('cmd-open'))}
          style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'var(--surface)', border: `1px solid var(--border)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke={T.textMuted} strokeWidth="2"/>
            <path d="M21 21l-4.35-4.35" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Notification bell */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setNotifOpen(o => !o)} style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'var(--surface)', border: `1px solid var(--border)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', position: 'relative',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke={notifCount > 0 ? T.teal : T.textMuted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {notifCount > 0 && (
              <div style={{
                position: 'absolute', top: -2, right: -2,
                width: 14, height: 14, borderRadius: '50%',
                background: T.red, color: '#fff',
                fontSize: 8, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid var(--bg)',
              }}>{notifCount > 9 ? '9+' : notifCount}</div>
            )}
          </button>

          {notifOpen && (
            <>
              <div onClick={() => setNotifOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 299 }} />
              <div style={{
                position: 'absolute', top: 38, right: 0, width: 280, zIndex: 300,
                background: 'var(--nav-bg-solid)',
                borderRadius: 14, border: `1px solid var(--border)`,
                boxShadow: 'var(--shadow-lg)',
                overflow: 'hidden',
              }}>
                <div style={{ padding: '10px 14px 6px', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textFaint, borderBottom: `1px solid var(--border)` }}>
                  Alerts
                </div>
                {notifs.length === 0 ? (
                  <div style={{ padding: '20px 14px', fontSize: 12, color: T.textMuted, textAlign: 'center' }}>All clear</div>
                ) : notifs.map((n, i) => (
                  <div key={i} style={{ padding: '8px 14px', borderBottom: `1px solid var(--border-soft)`, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                      background: n.type === 'deadline' ? 'var(--red)' : 'var(--blue)',
                    }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</div>
                      {n.course && <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>{n.course}</div>}
                    </div>
                  </div>
                ))}
                <button onClick={() => setNotifOpen(false)} style={{
                  width: '100%', padding: '8px', border: 'none', background: 'var(--surface)',
                  fontSize: 10.5, color: T.textMuted, cursor: 'pointer', fontWeight: 600,
                }}>Dismiss</button>
              </div>
            </>
          )}
        </div>

        {session?.user?.image ? (
          <img
            src={session.user.image}
            alt={initial}
            style={{
              width: 30, height: 30, borderRadius: 10,
              objectFit: 'cover',
              border: '1.5px solid var(--border-strong)',
            }}
          />
        ) : (
          <div style={{
            width: 30, height: 30, borderRadius: 10,
            background: `linear-gradient(135deg,var(--teal-dk),var(--teal))`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: '#fff',
          }}>{initial}</div>
        )}
      </div>
    </div>
  );
}
