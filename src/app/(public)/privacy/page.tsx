'use client';

import Link from 'next/link';
import { T } from '@/lib/theme';

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, padding: '24px' }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <Link href="/" style={{ fontSize: 12, color: T.teal, textDecoration: 'none', marginBottom: 20, display: 'block' }}>&larr; Back to AI Planner</Link>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, background: `linear-gradient(135deg,${T.teal},${T.blue})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Privacy Policy</h1>
        <p style={{ fontSize: 12, color: T.textMuted, marginBottom: 32 }}>Last updated: April 2026</p>

        {[
          { t: 'What We Collect', b: 'When you create an account we collect your email address, an optional display name, and a bcrypt hash of your password (we never store the password itself). If you later connect Google Calendar, we receive OAuth tokens for Google Calendar (read/write). If you connect RMIT Canvas, we store your Canvas API token. If you subscribe, Stripe stores your payment details (we never see or store your card number). All OAuth/API tokens are encrypted at rest using AES-256-GCM.' },
          { t: 'How We Use Your Data', b: 'Your Google Calendar events and Canvas data (assignments, quizzes, announcements, key dates) are fetched to render your schedule and, if you explicitly ask, to generate AI briefings, nudges, and plans. AI processing uses the Anthropic Claude API — the relevant context slice is sent to Anthropic and is subject to their data usage policy. We do not sell, share, or use your data for advertising.' },
          { t: 'Data Storage', b: 'All data is stored in Supabase (PostgreSQL) hosted in a secure cloud region. Google OAuth tokens and Canvas API tokens are encrypted with AES-256-GCM before storage. The encryption key is a server-side environment variable and never exposed to clients. Payment details are held by Stripe and never touch our servers.' },
          { t: 'Third-Party Services', b: 'We use: Google Calendar API (when you explicitly connect it in Settings) for calendar data; Anthropic Claude API for AI processing; Stripe for payments; Supabase for database + storage; Vercel for hosting. Each service has its own privacy policy governing the data they receive.' },
          { t: 'Data Retention', b: 'Your data is retained while your account is active. Cached data (calendar, Canvas) is refreshed regularly and old caches overwritten. AI interaction logs are kept for 30 days. When you delete your account, all data is wiped within 24 hours.' },
          { t: 'Your Rights', b: 'You can view all data we hold, export your task history, delete your account and all associated data permanently, revoke Google access from your Google Account settings, and disable push notifications. Under the Australian Privacy Act 1988 and GDPR (if applicable), you have the right to access, correct, and delete your personal information.' },
          { t: 'Account Deletion', b: 'You can delete your account from Settings → Delete account. This permanently removes all your data from our database, including tokens, settings, cached data, plans, and interaction history. Your Stripe subscription is also cancelled.' },
          { t: 'Cookies', b: 'We use a secure HTTP-only session cookie for authentication (managed by NextAuth.js), plus small preference cookies for theme + density. We do not use tracking cookies, third-party analytics cookies, or advertising cookies.' },
          { t: 'Contact', b: 'For privacy inquiries, contact us at hello@mrgren.store.' },
        ].map((s) => (
          <div key={s.t} style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 8 }}>{s.t}</h2>
            <p style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.8, fontWeight: 300 }}>{s.b}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
