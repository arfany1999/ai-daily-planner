'use client';

/**
 * Root error boundary — only used when the root layout itself crashes.
 * MUST include its own <html>/<body> since the root layout did not render.
 */

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{
        margin: 0, fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
        background: '#000', color: '#F5F1EA',
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>⚠</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Something broke hard</h1>
          <p style={{ fontSize: 13.5, color: '#B8AE9E', marginBottom: 20, lineHeight: 1.55 }}>
            A fatal error prevented the app from loading. We&apos;ve logged it. Try a hard refresh.
          </p>
          {error?.digest && (
            <p style={{ fontSize: 10, color: '#6B6158', marginBottom: 20, fontFamily: 'monospace' }}>
              ref {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              padding: '10px 18px', borderRadius: 10,
              background: 'linear-gradient(135deg, #9E5A34, #E09268)',
              color: '#fff', border: 'none',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >Try again</button>
        </div>
      </body>
    </html>
  );
}
