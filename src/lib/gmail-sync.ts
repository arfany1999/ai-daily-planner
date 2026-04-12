/**
 * Gmail → Supabase mirror
 *
 * syncEmailToCache() — fetches last 24h emails, writes to email_cache
 */

import { getGmailService } from './google';
import { supabaseAdmin } from './supabase';
import { logError } from './db';

export interface CachedEmail {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
}

export async function syncEmailToCache(userId: string): Promise<CachedEmail[]> {
  try {
    const gmail = await getGmailService(userId);
    const oneDayAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: `after:${oneDayAgo}`,
      maxResults: 20,
    });

    const messages = listRes.data.messages || [];
    const emails: CachedEmail[] = [];

    for (const msg of messages.slice(0, 15)) {
      try {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        });
        const headers = detail.data.payload?.headers || [];
        const get = (n: string) => headers.find((h) => h.name?.toLowerCase() === n)?.value || '';
        emails.push({
          id: msg.id!,
          from: get('from'),
          subject: get('subject'),
          snippet: detail.data.snippet || '',
          date: get('date'),
        });
      } catch { /* skip individual email errors */ }
    }

    await supabaseAdmin.from('email_cache').upsert(
      { user_id: userId, data: emails, fetched_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );

    return emails;
  } catch (err) {
    await logError('gmail-sync', err instanceof Error ? err.message : 'Unknown', userId);
    return [];
  }
}
