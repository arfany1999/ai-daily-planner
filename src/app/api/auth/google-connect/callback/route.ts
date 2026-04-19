/**
 * GET /api/auth/google-connect/callback
 * Receives the OAuth code from Google, stores tokens, redirects back to settings.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../[...nextauth]/options';
import { google } from 'googleapis';
import { supabaseAdmin } from '@/lib/supabase';
import { encrypt } from '@/lib/encryption';
import { syncCalendarToCache } from '@/lib/gcal-sync';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.redirect(new URL('/login', process.env.NEXTAUTH_URL!.trim()));

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  const base = process.env.NEXTAUTH_URL!.trim();

  if (error || !code) {
    return NextResponse.redirect(`${base}/settings?google=denied`);
  }

  try {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${base}/api/auth/google-connect/callback`
    );

    const { tokens } = await oauth2.getToken(code);
    const { access_token, refresh_token } = tokens;

    if (!access_token || !refresh_token) {
      return NextResponse.redirect(`${base}/settings?google=error`);
    }

    // Get the userId from the session
    const userId = (session as unknown as Record<string, string>).userId;
    if (!userId) return NextResponse.redirect(`${base}/settings?google=error`);

    // Store encrypted tokens on the user row
    await supabaseAdmin.from('users').update({
      google_access_token: encrypt(access_token),
      google_refresh_token: encrypt(refresh_token),
    }).eq('id', userId);

    // Kick off immediate calendar sync in the background
    void syncCalendarToCache(userId);

    return NextResponse.redirect(`${base}/settings?google=connected`);
  } catch (err) {
    console.error('[google-connect/callback]', err);
    return NextResponse.redirect(`${base}/settings?google=error`);
  }
}
