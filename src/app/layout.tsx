import type { Metadata, Viewport } from 'next';
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
  themeColor: '#f3ede1',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icons/icon-512.png" />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
