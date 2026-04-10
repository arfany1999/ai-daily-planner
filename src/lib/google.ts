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
