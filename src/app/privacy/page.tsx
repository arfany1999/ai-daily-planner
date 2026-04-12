export const metadata = { title: 'Privacy Policy — AI Daily' };

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px', fontFamily: 'system-ui, sans-serif', lineHeight: 1.7, color: '#1a1510' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ color: '#666', marginBottom: 40 }}>Last updated: April 2026</p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>What is AI Daily?</h2>
        <p>AI Daily is a personal productivity planner that connects to your Google Calendar, Gmail, and Canvas LMS to generate intelligent daily schedules, briefings, and task plans.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Data We Access</h2>
        <ul style={{ paddingLeft: 20 }}>
          <li><strong>Google Calendar</strong> — read and write access to create and view events for scheduling purposes.</li>
          <li><strong>Gmail</strong> — read-only access to surface high-priority emails in your daily briefing.</li>
          <li><strong>Google Profile</strong> — your name and email address for account creation.</li>
          <li><strong>Canvas LMS</strong> — assignment deadlines and announcements (optional, requires your Canvas API token).</li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>How We Use Your Data</h2>
        <ul style={{ paddingLeft: 20 }}>
          <li>To generate your daily schedule, tomorrow's plan, and weekly briefing using AI.</li>
          <li>Calendar events and emails are cached in our database for up to 24 hours to enable fast responses.</li>
          <li>Data is used solely to provide the planning features of this app — never sold or shared with third parties.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Data Storage</h2>
        <p>Your data is stored in a secured Supabase (PostgreSQL) database. OAuth tokens are encrypted at rest. We do not store the full content of your emails — only metadata (sender, subject, snippet).</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Data Retention & Deletion</h2>
        <p>You can revoke access at any time via your <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener" style={{ color: '#4a6ef5' }}>Google Account permissions page</a>. To delete your account and all associated data, contact us at the email below.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Third-Party Services</h2>
        <ul style={{ paddingLeft: 20 }}>
          <li><strong>Anthropic (Claude AI)</strong> — your calendar/canvas data is sent to Claude to generate schedules. Anthropic's <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener" style={{ color: '#4a6ef5' }}>privacy policy</a> applies.</li>
          <li><strong>Vercel</strong> — hosts the application.</li>
          <li><strong>Supabase</strong> — stores your data.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Contact</h2>
        <p>For privacy questions or data deletion requests: <a href="mailto:hamidreza.arfanyi2018@gmail.com" style={{ color: '#4a6ef5' }}>hamidreza.arfanyi2018@gmail.com</a></p>
      </section>

      <p style={{ fontSize: 13, color: '#999', marginTop: 48 }}>This app is a personal tool and is not affiliated with Google, Anthropic, or Canvas.</p>
    </main>
  );
}
