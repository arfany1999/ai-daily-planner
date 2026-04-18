import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import AuthProvider from '@/lib/auth-provider';
import ServiceWorkerRegistrar from '@/components/ServiceWorker';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Planner',
  description: 'Your intelligent daily planner',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AI Planner',
  },
};

export const viewport: Viewport = {
  themeColor: '#0A0A08',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side theme read — avoids the flash of wrong theme on first paint.
  // Client-side applyTheme also sets this cookie whenever the user changes the
  // theme (see lib/theme.ts).
  const cookieStore = await cookies();
  const themePref = cookieStore.get('cmd-theme')?.value;
  const densityPref = cookieStore.get('cmd-density')?.value;

  return (
    <html
      lang="en"
      data-theme={themePref === 'light' || themePref === 'dark' ? themePref : undefined}
      data-density={densityPref === 'cozy' || densityPref === 'compact' ? densityPref : undefined}
    >
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icons/icon-512.png" />
      </head>
      <body>
        <div id="commander-bg" />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <AuthProvider>{children}</AuthProvider>
          <ServiceWorkerRegistrar />
        </div>
      </body>
    </html>
  );
}
