'use client';

import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { T } from '@/lib/theme';

function LoginContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  useEffect(() => {
    if (session) router.push('/home');
  }, [session, router]);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    setLoading(true);

    try {
      if (mode === 'signup') {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name }),
        });
        const data = await res.json();
        if (!res.ok) { setFormError(data.error || 'Sign up failed.'); setLoading(false); return; }
        // Auto sign in after signup
        const result = await signIn('credentials', { email, password, redirect: false });
        if (result?.error) { setFormError('Account created! Please sign in.'); setMode('signin'); }
        else router.push('/home');
      } else {
        const result = await signIn('credentials', { email, password, redirect: false });
        if (result?.error) setFormError('Incorrect email or password.');
        else router.push('/home');
      }
    } catch {
      setFormError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '13px 14px', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.border}`,
    borderRadius: 12, fontSize: 14, color: T.text, outline: 'none',
    fontFamily: 'inherit',
  };

  return (
    <div style={{
      minHeight: '100vh', background: T.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 380, padding: '44px 36px',
        background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 24, border: `1px solid ${T.border}`, textAlign: 'center',
      }}>
        {/* Logo */}
        <div style={{ position: 'relative', width: 64, height: 64, margin: '0 auto 16px' }}>
          <img src="/icons/icon-source.jpg" alt="AI Daily" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.1)', boxShadow: `0 8px 28px rgba(196,118,74,0.18)` }} />
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderRadius: '50%', background: T.teal, border: '2px solid #0C0B09', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="white"/></svg>
          </div>
        </div>

        <div className="title-display" style={{ fontSize: 28, fontWeight: 800, color: T.text, letterSpacing: '-0.02em', marginBottom: 6 }}>AI Planner</div>
        <div style={{ fontSize: 12.5, color: T.textSoft, marginBottom: 22, lineHeight: 1.55 }}>
          Your chief-of-staff calendar.
        </div>

        {/* Error from URL */}
        {error && (
          <div style={{ padding: '10px 14px', marginBottom: 16, background: 'rgba(212,96,74,0.1)', border: '1px solid rgba(212,96,74,0.2)', borderRadius: 10, fontSize: 12, color: T.red }}>
            Something went wrong. Please try again.
          </div>
        )}

        {/* Form error */}
        {formError && (
          <div style={{ padding: '10px 14px', marginBottom: 16, background: 'rgba(212,96,74,0.1)', border: '1px solid rgba(212,96,74,0.2)', borderRadius: 10, fontSize: 12, color: T.red }}>
            {formError}
          </div>
        )}

        {/* Success */}
        {formSuccess && (
          <div style={{ padding: '10px 14px', marginBottom: 16, background: 'rgba(93,184,112,0.1)', border: '1px solid rgba(93,184,112,0.2)', borderRadius: 10, fontSize: 12, color: T.green }}>
            {formSuccess}
          </div>
        )}

        {/* ── Email form ── */}
        <form onSubmit={handleEmailSubmit} style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Sign up / Sign in toggle */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 4 }}>
              {(['signin', 'signup'] as const).map((m) => (
                <button key={m} type="button" onClick={() => { setMode(m); setFormError(''); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: '4px 0', color: mode === m ? T.teal : T.textMuted, borderBottom: mode === m ? `2px solid ${T.teal}` : '2px solid transparent', transition: 'all 0.15s' }}>
                  {m === 'signin' ? 'Sign In' : 'Create Account'}
                </button>
              ))}
            </div>

            {mode === 'signup' && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, display: 'block', marginBottom: 5 }}>Name (optional)</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" style={inputStyle} />
              </div>
            )}

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, display: 'block', marginBottom: 5 }}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required style={inputStyle} />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, display: 'block', marginBottom: 5 }}>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'Min 8 characters' : 'Your password'} required style={inputStyle} />
            </div>

            <button type="submit" disabled={loading}
              style={{
                width: '100%', padding: '13px 0', marginTop: 4,
                background: loading ? 'rgba(74,110,245,0.5)' : `linear-gradient(135deg,${T.blue},${T.teal})`,
                color: '#fff', border: 'none', borderRadius: 14,
                fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: loading ? 'none' : `0 6px 20px rgba(74,110,245,0.3)`,
                transition: 'all 0.2s',
              }}>
              {loading ? '...' : mode === 'signup' ? 'Create Account' : 'Sign In'}
            </button>

            {mode === 'signin' && (
              <p style={{ fontSize: 11, color: T.textMuted, textAlign: 'center', margin: 0 }}>
                No account?{' '}
                <button type="button" onClick={() => setMode('signup')} style={{ background: 'none', border: 'none', color: T.teal, cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: 0 }}>
                  Create one
                </button>
              </p>
            )}

        </form>

        {/* Feature list — short dot points */}
        <div style={{ marginTop: 18, textAlign: 'left' }}>
          {[
            '1:1 Google Calendar mirror',
            'Canvas deadlines + quizzes',
            'AI briefing + proactive nudges',
            'Voice + ⌘K commands',
            'One-tap reschedule',
          ].map((text, i, arr) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 11.5, color: T.textSoft, lineHeight: 1.4, marginBottom: i === arr.length - 1 ? 0 : 3 }}>
              <span style={{ flexShrink: 0, width: 4, height: 4, borderRadius: '50%', background: T.teal }} />
              <span>{text}</span>
            </div>
          ))}
        </div>

        {/* Pricing */}
        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 14, lineHeight: 1.6 }}>
          <strong style={{ color: T.textSoft }}>7-day free trial</strong>, then $6.99/month. Cancel anytime.
        </div>

        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 18, lineHeight: 1.6 }}>
          By creating an account, you agree to our{' '}
          <a href="/privacy" style={{ color: T.teal, textDecoration: 'none' }}>Privacy Policy</a>
          {' '}and{' '}
          <a href="/terms" style={{ color: T.teal, textDecoration: 'none' }}>Terms</a>.
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9E9285', fontSize: 14 }}>
        Loading...
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
