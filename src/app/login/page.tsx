'use client';

import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';
import { T } from '@/lib/theme';

function LoginContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  useEffect(() => {
    if (session) router.push('/home');
  }, [session, router]);

  return (
    <div style={{
      minHeight: '100vh',
      background: T.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      {/* Soft background blobs */}
      <div style={{
        position: 'fixed', top: -80, right: -80,
        width: 300, height: 300, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(74,110,245,0.06), transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed', bottom: -60, left: -60,
        width: 250, height: 250, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(232,123,53,0.06), transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%', maxWidth: 380,
        padding: '52px 36px',
        background: 'rgba(255,255,255,0.58)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 24,
        border: '1px solid rgba(255,255,255,0.85)',
        textAlign: 'center',
        boxShadow: '0 16px 48px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
      }}>
        <div style={{ position: 'relative', width: 72, height: 72, margin: '0 auto 20px' }}>
          <img
            src="/icons/icon-source.jpg"
            alt="AI Planner"
            style={{
              width: 72, height: 72, borderRadius: '50%',
              objectFit: 'cover',
              border: '3px solid rgba(255,255,255,0.9)',
              boxShadow: `0 8px 28px rgba(74,110,245,0.18)`,
            }}
          />
          <div style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 22, height: 22, borderRadius: '50%',
            background: `linear-gradient(135deg,${T.tealDk},${T.teal})`,
            border: '2px solid white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="white"/>
            </svg>
          </div>
        </div>

        <div style={{
          fontSize: 28, fontWeight: 700, color: T.text,
          letterSpacing: '-0.8px', marginBottom: 6,
        }}>
          AI Planner
        </div>
        <div style={{
          fontSize: 14, color: T.textMuted,
          marginBottom: 36, fontWeight: 400,
        }}>
          Your intelligent daily planner
        </div>

        {error && (
          <div style={{
            padding: '12px 16px', marginBottom: 20,
            background: 'rgba(229,77,77,0.08)',
            border: '1px solid rgba(229,77,77,0.2)',
            borderRadius: 12, fontSize: 13, color: T.red,
          }}>
            {error === 'OAuthAccountNotLinked'
              ? 'This email is already linked to another account.'
              : 'Something went wrong. Please try again.'}
          </div>
        )}

        <button
          onClick={() => signIn('google', { callbackUrl: '/home' })}
          style={{
            width: '100%', padding: '15px 0',
            background: `linear-gradient(135deg,${T.tealDk},${T.teal})`,
            color: '#fff', border: 'none', borderRadius: 14,
            fontSize: 15, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: `0 6px 20px ${T.tealGlow}`,
            transition: 'transform 0.2s cubic-bezier(0.34,1.56,0.64,1)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.02)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1.02)')}
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.9 33.6 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.7 29.2 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.2-2.7-.4-3.9z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.4 18.8 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.7 29.2 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5 0 9.6-1.6 13.2-4.4l-6.1-5.2C29 36 26.6 36.7 24 36.7c-5.4 0-9.9-3.4-11.5-8.2l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.1 5.2C36.9 39.2 44 34 44 24c0-1.3-.2-2.7-.4-3.9z"/>
          </svg>
          Sign in with Google
        </button>

        <div style={{
          marginTop: 18, padding: '10px 14px', borderRadius: 10,
          background: 'rgba(74,110,245,0.06)', border: '1px solid rgba(74,110,245,0.15)',
          fontSize: 11, color: T.textSoft, lineHeight: 1.6, textAlign: 'left',
        }}>
          <strong style={{ color: T.teal }}>Tip:</strong> If Google shows a warning screen, click <strong>&ldquo;Advanced&rdquo;</strong> then <strong>&ldquo;Go to AI Planner&rdquo;</strong> to continue. This is normal for apps in development.
        </div>

        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 14, lineHeight: 1.6 }}>
          By signing in, you agree to our{' '}
          <a href="/terms" style={{ color: T.teal, textDecoration: 'none' }}>Terms</a>
          {' '}and{' '}
          <a href="/privacy" style={{ color: T.teal, textDecoration: 'none' }}>Privacy Policy</a>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh', background: '#f3ede1',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#a09880', fontSize: 14,
      }}>
        Loading...
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
