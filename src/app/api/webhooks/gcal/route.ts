/**
 * Google Calendar Push Notification receiver
 *
 * Channel state is stored in user_settings.gcal_watch_channel —
 * no separate table required.
 */

import { syncCalendarToCache, getUserByChannelId } from '@/lib/gcal-sync';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const channelId = req.headers.get('x-goog-channel-id');
  const state = req.headers.get('x-goog-resource-state');

  // Initial handshake — acknowledge only
  if (state === 'sync') return new Response(null, { status: 200 });

  if (!channelId) return new Response('Missing X-Goog-Channel-ID', { status: 400 });

  // Look up user by channel_id stored in user_settings JSONB
  const userId = await getUserByChannelId(channelId);

  if (!userId) return new Response(null, { status: 200 }); // unknown/expired channel

  // Sync in background, respond to Google immediately
  void syncCalendarToCache(userId);

  return new Response(null, { status: 200 });
}

export async function GET() {
  return new Response('OK', { status: 200 });
}
