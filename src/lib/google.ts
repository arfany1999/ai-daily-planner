import { google } from 'googleapis';
import { getUserTokens, logError } from './db';
import { supabaseAdmin } from './supabase';
import { encrypt } from './encryption';

// Get an authenticated OAuth2 client with auto-refresh
export async function getGoogleClient(userId: string) {
  const tokens = await getUserTokens(userId);
  if (!tokens) throw new Error('No Google tokens found. Please sign in again.');

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });

  // Auto-refresh: store new tokens
  oauth2.on('tokens', (newTokens) => {
    (async () => {
      try {
        if (newTokens.access_token) {
          const enc = encrypt(newTokens.access_token);
          await supabaseAdmin.from('users').update({ google_access_token: enc }).eq('id', userId);
        }
        if (newTokens.refresh_token) {
          const enc = encrypt(newTokens.refresh_token);
          await supabaseAdmin.from('users').update({ google_refresh_token: enc }).eq('id', userId);
        }
      } catch (e) {
        await logError('google/token-refresh', e instanceof Error ? e.message : 'Token storage failed', userId);
      }
    })();
  });

  return oauth2;
}

export async function getCalendarService(userId: string) {
  return google.calendar({ version: 'v3', auth: await getGoogleClient(userId) });
}

export async function getGmailService(userId: string) {
  return google.gmail({ version: 'v1', auth: await getGoogleClient(userId) });
}

/* ──────────────────────────────────────────────────────────────────────────
   1:1 mirror helpers — create/update/delete Google Calendar events
   so AI Daily blocks always show up in the user's Google Calendar.
   Returns event.id which should be stored on the TimelineBlock so later
   patch/delete calls can target the right event.
   ────────────────────────────────────────────────────────────────────────── */

const TZ = 'Australia/Melbourne';
const AI_CAL_MARKER = '[AI]'; // so we can identify AI-created events in GCal

export interface GcalBlockInput {
  title: string;
  date: string;        // YYYY-MM-DD
  start_time: string;  // HH:MM (24h)
  end_time: string;    // HH:MM
  description?: string;
  domain?: string;
}

function makeIso(date: string, time: string): string {
  // Compose Melbourne-zoned ISO local string; Google accepts dateTime + timeZone
  return `${date}T${time}:00`;
}

const DOMAIN_TO_COLOR_ID: Record<string, string> = {
  academia: '9',  // blueberry
  dev:      '3',  // grape
  finance:  '5',  // banana (yellow)
  health:   '10', // basil (green)
  admin:    '6',  // tangerine (orange)
  break:    '8',  // graphite (grey)
};

export async function createGcalEvent(userId: string, block: GcalBlockInput): Promise<string | null> {
  try {
    const cal = await getCalendarService(userId);
    const res = await cal.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: `${AI_CAL_MARKER} ${block.title}`,
        description: [block.description, `[ai-daily:${block.domain || 'admin'}]`].filter(Boolean).join('\n\n'),
        start: { dateTime: makeIso(block.date, block.start_time), timeZone: TZ },
        end:   { dateTime: makeIso(block.date, block.end_time),   timeZone: TZ },
        colorId: DOMAIN_TO_COLOR_ID[block.domain || 'admin'] || '6',
      },
    });
    return res.data.id ?? null;
  } catch (e) {
    await logError('google/create-event', e instanceof Error ? e.message : 'create-failed', userId);
    return null;
  }
}

export async function updateGcalEvent(userId: string, eventId: string, block: GcalBlockInput): Promise<boolean> {
  try {
    const cal = await getCalendarService(userId);
    await cal.events.patch({
      calendarId: 'primary',
      eventId,
      requestBody: {
        summary: `${AI_CAL_MARKER} ${block.title}`,
        description: [block.description, `[ai-daily:${block.domain || 'admin'}]`].filter(Boolean).join('\n\n'),
        start: { dateTime: makeIso(block.date, block.start_time), timeZone: TZ },
        end:   { dateTime: makeIso(block.date, block.end_time),   timeZone: TZ },
        colorId: DOMAIN_TO_COLOR_ID[block.domain || 'admin'] || '6',
      },
    });
    return true;
  } catch (e) {
    await logError('google/update-event', e instanceof Error ? e.message : 'update-failed', userId);
    return false;
  }
}

export async function deleteGcalEvent(userId: string, eventId: string): Promise<boolean> {
  try {
    const cal = await getCalendarService(userId);
    await cal.events.delete({ calendarId: 'primary', eventId });
    return true;
  } catch (e) {
    await logError('google/delete-event', e instanceof Error ? e.message : 'delete-failed', userId);
    return false;
  }
}
