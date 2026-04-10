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
          { t: 'What We Collect', b: 'When you sign in with Google, we receive your name, email, profile picture, and OAuth tokens for Google Calendar (read/write) and Gmail (read-only). If you connect RMIT Canvas, we store your Canvas API token. All tokens are encrypted at rest using AES-256-GCM.' },
          { t: 'How We Use Your Data', b: 'Your Google Calendar events and Gmail emails are fetched to generate AI briefings and to-do lists. Canvas data (assignments, announcements, files) is used to create study materials and track deadlines. All AI processing uses the Anthropic Claude API — your data is sent to Anthropic for processing and is subject to their data usage policy. We do not sell, share, or use your data for advertising.' },
          { t: 'Data Storage', b: 'All data is stored in an encrypted SQLite database on the server. Google OAuth tokens and Canvas API tokens are encrypted with AES-256-GCM before storage. Connection API keys for custom integrations are similarly encrypted. The encryption key is stored as a server environment variable and never exposed to clients.' },
          { t: 'Third-Party Services', b: 'We use: Google OAuth for authentication, Google Calendar API and Gmail API for calendar/email data, Anthropic Claude API for AI processing, and SendGrid for email delivery. Each service has its own privacy policy governing data they receive.' },
          { t: 'Data Retention', b: 'Your data is retained as long as your account is active. Cached data (calendar, email, Canvas) is refreshed regularly and old caches are overwritten. AI conversation history is kept for 30 days. You can delete your account and all associated data at any time from Settings.' },
          { t: 'Your Rights', b: 'You can: view all data the app holds about you, export your task history and study materials, delete your account and all data permanently, revoke Google access from your Google Account settings, and disable email notifications. Under the Australian Privacy Act 1988, you have the right to access, correct, and delete your personal information.' },
          { t: 'Account Deletion', b: 'You can delete your account from the Settings page. This permanently removes all your data from our database, including tokens, settings, cached data, materials, conversations, and task history. Google OAuth grants are also revoked.' },
          { t: 'Cookies', b: 'We use a single secure HTTP-only session cookie for authentication (managed by NextAuth.js). We do not use tracking cookies, analytics cookies, or third-party cookies.' },
          { t: 'Contact', b: 'For privacy inquiries, contact us at the email listed on mrgren.store.' },
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
