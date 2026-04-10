import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { getGmailService } from '@/lib/google';
import { supabaseAdmin } from '@/lib/supabase';
import { logError } from '@/lib/db';

const HIGH_PRIORITY_KEYWORDS = /assignment|deadline|exam|assessment|due|urgent|important|final|submission/i;

interface EmailItem { id: string; from: string; subject: string; snippet: string; date: string; priority: 'HIGH' | 'MEDIUM' }

function extractHeader(headers: { name?: string | null; value?: string | null }[], name: string): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

export const GET = withAuth(async (_req, userId) => {
  try {
    const gmail = await getGmailService(userId);
    const oneDayAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
    const listRes = await gmail.users.messages.list({ userId: 'me', q: `after:${oneDayAgo}`, maxResults: 30 });
    const messages = listRes.data.messages || [];
    const emails: EmailItem[] = [];

    for (const msg of messages) {
      try {
        const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id!, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] });
        const headers = detail.data.payload?.headers || [];
        const from = extractHeader(headers, 'From');
        const subject = extractHeader(headers, 'Subject');
        const date = extractHeader(headers, 'Date');
        const snippet = detail.data.snippet || '';
        const isEdu = from.includes('.edu.au') || from.includes('.edu');
        const hasKeyword = HIGH_PRIORITY_KEYWORDS.test(subject) || HIGH_PRIORITY_KEYWORDS.test(snippet);
        emails.push({ id: msg.id!, from, subject, snippet, date, priority: isEdu || hasKeyword ? 'HIGH' : 'MEDIUM' });
      } catch (e) { await logError('api/emails/message', e instanceof Error ? e.message : 'Failed', userId); }
    }

    emails.sort((a, b) => { if (a.priority !== b.priority) return a.priority === 'HIGH' ? -1 : 1; return new Date(b.date).getTime() - new Date(a.date).getTime(); });

    await supabaseAdmin.from('email_cache').upsert({
      user_id: userId,
      data: emails,
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    return NextResponse.json({ emails, stale: false });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    await logError('api/emails', msg, userId);

    const { data: cached } = await supabaseAdmin
      .from('email_cache')
      .select('data')
      .eq('user_id', userId)
      .single();
    if (cached) return NextResponse.json({ emails: cached.data, stale: true });
    return NextResponse.json({ error: 'Failed to fetch emails', message: msg }, { status: 500 });
  }
});
