/**
 * GET /api/auth/google-connect
 * Initiates a Google OAuth flow to connect Google Calendar for the signed-in
 * user. Used after email/password signup so users can mirror their schedule.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../[...nextauth]/options';
import { google } from 'googleapis';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL?.trim()}/api/auth/google-connect/callback`
  );

  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',           // force refresh_token to always be returned
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/calendar',
    ],
  });

  return NextResponse.redirect(url);
}
