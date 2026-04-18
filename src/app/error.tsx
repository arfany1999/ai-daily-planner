'use client';

/**
 * Route-level error boundary — catches any render/runtime crash inside
 * the nested layouts and shows a recoverable UI instead of a blank page.
 * Next.js auto-wires this per segment.
 */

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Optional: POST to ERROR_WEBHOOK_URL via a small API route; for now
    // just log so the user can read it in DevTools.
    // We intentionally don't block the render on this.
    try {
      if (typeof window !== 'undefined' && (window as unknown as { Sentry?: { captureException: (e: unknown) => void } }).Sentry) {
        (window as unknown as { Sentry: { captureException: (e: unknown) => void } }).Sentry.captureException(error);
      }
    } catch { /* noop */ }
    // Fallback: post to our error sink so we catch client-side crashes too.
    fetch('/api/_client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: String(error?.message || error),
        digest: error?.digest,
        stack: error?.stack,
        href: typeof window !== 'undefined' ? window.location.href : '',
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, background: 'var(--bg)', color: 'var(--text)',
      fontFamily: 'Inter, -apple-system, sans-serif',
    }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>⚠</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.02em' }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-soft)', marginBottom: 20, lineHeight: 1.55 }}>
          We logged it automatically. Try again — if it keeps happening, a hard refresh usually sorts it out.
        </p>
        {error?.digest && (
          <p className="mono" style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 20 }}>
            ref {error.digest}
          </p>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            onClick={reset}
            style={{
              padding: '10px 18px', borderRadius: 10,
              background: 'linear-gradient(135deg, var(--teal-dk), var(--teal-lt))',
              color: '#fff', border: 'none',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 14px var(--teal-glow)',
            }}
          >Try again</button>
          <a
            href="/home"
            style={{
              padding: '10px 18px', borderRadius: 10,
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--text-soft)',
              fontSize: 13, fontWeight: 600,
              textDecoration: 'none', display: 'inline-block',
            }}
          >Go home</a>
        </div>
      </div>
    </div>
  );
}
