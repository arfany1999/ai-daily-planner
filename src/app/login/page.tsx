'use client';

import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';

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
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        position: 'relative',
        width: 400,
        padding: '56px 40px',
        background: 'var(--bg2)',
        borderRadius: 20,
        border: '1px solid var(--border)',
        textAlign: 'center',
        overflow: 'hidden',
      }}>
        {/* Glow */}
        <div style={{
          position: 'absolute',
          top: -80,
          right: -80,
          width: 200,
          height: 200,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(13,155,138,0.08), transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{
          fontSize: 32,
          fontWeight: 700,
          background: 'linear-gradient(135deg, var(--teal), var(--blue))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          letterSpacing: '-1px',
          marginBottom: 6,
        }}>
          AI Planner
        </div>
        <div style={{
          fontSize: 14,
          color: 'var(--text-muted)',
          marginBottom: 40,
          fontWeight: 300,
        }}>
          Your intelligent daily planner
        </div>

        {error && (
          <div style={{
            padding: '12px 16px',
            marginBottom: 20,
            background: 'rgba(229,77,77,0.08)',
            border: '1px solid rgba(229,77,77,0.2)',
            borderRadius: 10,
            fontSize: 13,
            color: 'var(--red)',
          }}>
            {error === 'OAuthAccountNotLinked'
              ? 'This email is already linked to another account.'
              : 'Something went wrong. Please try again.'}
          </div>
        )}

        <button
          onClick={() => signIn('google', { callbackUrl: '/home' })}
          style={{
            width: '100%',
            padding: '15px 0',
            background: 'linear-gradient(135deg, var(--teal-dk), var(--teal))',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            boxShadow: '0 4px 24px rgba(13,155,138,0.3)',
            transition: 'all 0.3s',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.9 33.6 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.7 29.2 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.2-2.7-.4-3.9z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.4 18.8 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.7 29.2 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5 0 9.6-1.6 13.2-4.4l-6.1-5.2C29 36 26.6 36.7 24 36.7c-5.4 0-9.9-3.4-11.5-8.2l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.1 5.2C36.9 39.2 44 34 44 24c0-1.3-.2-2.7-.4-3.9z"/>
          </svg>
          Sign in with Google
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-muted)',
      }}>
        Loading...
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
