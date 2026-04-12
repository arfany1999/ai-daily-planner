'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import { T } from '@/lib/theme';

const B = ({ children }: { children: React.ReactNode }) => <strong style={{ fontWeight: 600, color: '#1a1510' }}>{children}</strong>;

const features = [
  { icon: '🎓', title: 'Reads your Canvas', desc: <><B>Assignments</B>, <B>announcements</B>, <B>deadlines</B> — pulled automatically from your university Canvas.</> },
  { icon: '📅', title: 'Syncs Calendar & Gmail', desc: <>Classes, shifts, <B>professor emails</B> — tagged and <B>linked by course</B>, updated in real time.</> },
  { icon: '🚨', title: 'Flags what you missed', desc: <>Quiz on Canvas but <B>not calendared</B>? No study block before a deadline? <B>You&apos;ll know</B>.</> },
  { icon: '🌅', title: 'Builds your day', desc: <>Every morning — <B>prioritised</B>, <B>time-blocked</B>, ready before you open the app.</> },
  { icon: '📚', title: 'Study materials from lectures', desc: <>Turns your lecture files into <B>flashcards</B> and <B>MCQs</B> — tagged to the right course and week.</> },
  { icon: '🤖', title: 'Ask it anything', desc: <>It reasons across <B>every source</B> and tells you <B>what to do next</B>.</> },
];

export default function LandingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) router.push('/home');
  }, [session, router]);

  if (status === 'loading') {
    return <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textMuted }}>Loading...</div>;
  }
  if (session) return null;

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text }}>
      {/* Nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: `linear-gradient(135deg,${T.tealDk},${T.teal})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>A</div>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.5px' }}>AI Planner</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link href="/privacy" style={{ fontSize: 12, color: T.textMuted, textDecoration: 'none' }}>Privacy</Link>
          <Link href="/terms" style={{ fontSize: 12, color: T.textMuted, textDecoration: 'none' }}>Terms</Link>
          <Link href="/login" style={{ padding: '8px 20px', background: `linear-gradient(135deg,${T.tealDk},${T.teal})`, color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
        </div>
      </div>

      {/* Hero */}
      <div style={{ textAlign: 'center', padding: '80px 24px 60px', maxWidth: 700, margin: '0 auto', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 400, height: 400, borderRadius: '50%', background: `radial-gradient(circle, ${T.teal}10, transparent 70%)`, pointerEvents: 'none' }} />
        <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: '-1.5px', lineHeight: 1.15, marginBottom: 16, background: `linear-gradient(135deg, ${T.teal}, ${T.blue})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Stop surviving university.<br />Start running it.
        </div>
        <div style={{ fontSize: 15, color: T.textSoft, fontWeight: 300, lineHeight: 1.8, maxWidth: 520, margin: '0 auto 32px' }}>
          <B>Canvas</B>, <B>Google Calendar</B>, <B>Gmail</B>, lectures, work shifts — you&apos;re expected to hold it all together yourself.
          <br /><br />
          <span style={{ fontWeight: 600, color: T.text }}>AI Planner</span> is a <B>5-layered AI-powered system</B> built for university students. It doesn&apos;t store your data. It <B>thinks</B> about it.
        </div>
        <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '14px 32px', background: `linear-gradient(135deg,${T.tealDk},${T.teal})`, color: '#fff', borderRadius: 12, fontSize: 16, fontWeight: 600, textDecoration: 'none', boxShadow: `0 4px 24px ${T.teal}30` }}>
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.9 33.6 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.7 29.2 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.2-2.7-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.4 18.8 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.7 29.2 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5 0 9.6-1.6 13.2-4.4l-6.1-5.2C29 36 26.6 36.7 24 36.7c-5.4 0-9.9-3.4-11.5-8.2l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.1 5.2C36.9 39.2 44 34 44 24c0-1.3-.2-2.7-.4-3.9z"/></svg>
          Get started with Google
        </Link>
        <div style={{ fontSize: 12, color: T.textMuted, marginTop: 12, fontWeight: 300 }}>Free to use. No credit card required.</div>
        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6, fontWeight: 400, opacity: 0.7 }}>Built by Hamidreza Arfany</div>
      </div>

      {/* Features */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 60px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {features.map((f) => (
          <div key={f.title} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: '22px 20px' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>{f.icon}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 6 }}>{f.title}</div>
            <div style={{ fontSize: 12, color: T.textSoft, lineHeight: 1.7, fontWeight: 300 }}>{f.desc}</div>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 24px 60px', textAlign: 'center' }}>
        <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, letterSpacing: '-0.5px' }}>How it works</div>
        {[
          { n: '1', t: 'Sign in & connect', d: <>Google or email. Link your <B>Calendar</B>, <B>Gmail</B>, and <B>Canvas</B> in Settings.</> },
          { n: '2', t: 'AI ingests everything', d: <>Assignments, announcements, emails, events — pulled and <B>cross-referenced</B> automatically.</> },
          { n: '3', t: 'Gaps get flagged', d: <><B>Missing study blocks</B>, uncalendared quizzes, deadline clashes — surfaced <B>before they bite</B>.</> },
          { n: '4', t: 'Your day is built', d: <>Every morning: <B>prioritised</B>, <B>time-blocked</B>, ready. Ask the AI anything about your week.</> },
        ].map((s) => (
          <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, textAlign: 'left', marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg,${T.tealDk},${T.teal})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{s.n}</div>
            <div><div style={{ fontSize: 14, fontWeight: 600 }}>{s.t}</div><div style={{ fontSize: 12, color: T.textSoft, fontWeight: 300 }}>{s.d}</div></div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ borderTop: `1px solid ${T.border}`, padding: '20px 24px', textAlign: 'center', fontSize: 11, color: T.textMuted, fontWeight: 300 }}>
        AI Planner by <a href="https://mrgren.store" style={{ color: T.teal, textDecoration: 'none' }}>mrgren.store</a>
        {' | '}<Link href="/privacy" style={{ color: T.textMuted, textDecoration: 'none' }}>Privacy Policy</Link>
        {' | '}<Link href="/terms" style={{ color: T.textMuted, textDecoration: 'none' }}>Terms of Service</Link>
      </div>
    </div>
  );
}
