/**
 * Google Calendar → Supabase mirror
 *
 * Channel state is stored in user_settings.gcal_watch_channel (JSONB) —
 * no extra table required.
 *
 * syncCalendarToCache()  — pulls events from Google, writes to calendar_cache
 * registerGcalWatch()    — subscribes to Google Calendar push notifications
 * unregisterGcalWatch()  — stops the push channel
 * renewExpiringWatches() — renews channels expiring within 24 h (called by cron)
 */

import { getCalendarService } from './google';
import { supabaseAdmin } from './supabase';
import { logError } from './db';

const TIMEZONE = 'Australia/Melbourne';
const LOOK_AHEAD_DAYS = 14;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MirroredEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
  color: string | null;
  status: string | undefined;
}

interface WatchChannel {
  channel_id: string;
  resource_id: string;
  calendar_id: string;
  expiry_at: string;
}

// ── Core sync ─────────────────────────────────────────────────────────────────

export async function syncCalendarToCache(userId: string): Promise<MirroredEvent[]> {
  try {
    const calendar = await getCalendarService(userId);

    const now = new Date();
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + LOOK_AHEAD_DAYS);

    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      timeZone: TIMEZONE,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    });

    const events: MirroredEvent[] = (res.data.items || []).map((ev) => ({
      id: ev.id ?? crypto.randomUUID(),
      title: ev.summary || 'Untitled',
      description: ev.description || '',
      location: ev.location || '',
      start: ev.start?.dateTime || ev.start?.date || '',
      end: ev.end?.dateTime || ev.end?.date || '',
      allDay: !ev.start?.dateTime,
      color: ev.colorId || null,
      status: ev.status ?? undefined,
    }));

    await supabaseAdmin.from('calendar_cache').upsert(
      { user_id: userId, data: events, fetched_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );

    return events;
  } catch (err) {
    await logError('gcal-sync', err instanceof Error ? err.message : 'Unknown', userId);
    return [];
  }
}

// ── Webhook registration (stored in user_settings JSONB — no extra table) ────

export async function registerGcalWatch(userId: string): Promise<void> {
  const webhookUrl = process.env.NEXTAUTH_URL
    ? `${process.env.NEXTAUTH_URL}/api/webhooks/gcal`
    : null;

  if (!webhookUrl) return;

  try {
    const calendar = await getCalendarService(userId);
    const channelId = crypto.randomUUID();
    const expiryMs = Date.now() + 6 * 24 * 60 * 60 * 1000; // 6 days

    const res = await calendar.events.watch({
      calendarId: 'primary',
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: webhookUrl,
        expiration: String(expiryMs),
      },
    });

    const channel: WatchChannel = {
      channel_id: channelId,
      resource_id: res.data.resourceId || '',
      calendar_id: 'primary',
      expiry_at: new Date(expiryMs).toISOString(),
    };

    // Store in user_settings.gcal_watch_channel — no separate table needed
    await supabaseAdmin
      .from('user_settings')
      .upsert({ user_id: userId, gcal_watch_channel: channel }, { onConflict: 'user_id' });
  } catch (err) {
    await logError('gcal-watch/register', err instanceof Error ? err.message : 'Unknown', userId);
  }
}

export async function unregisterGcalWatch(userId: string): Promise<void> {
  try {
    const { data } = await supabaseAdmin
      .from('user_settings')
      .select('gcal_watch_channel')
      .eq('user_id', userId)
      .single();

    const ch = data?.gcal_watch_channel as WatchChannel | null;
    if (!ch) return;

    const calendar = await getCalendarService(userId);
    await calendar.channels.stop({
      requestBody: { id: ch.channel_id, resourceId: ch.resource_id },
    });

    await supabaseAdmin
      .from('user_settings')
      .upsert({ user_id: userId, gcal_watch_channel: null }, { onConflict: 'user_id' });
  } catch { /* channel may already be expired */ }
}

// ── Webhook receiver helper — look up user by channel_id ─────────────────────

export async function getUserByChannelId(channelId: string): Promise<string | null> {
  // Scan user_settings for the matching channel_id
  // (works fine for single-user or small-team apps)
  const { data } = await supabaseAdmin
    .from('user_settings')
    .select('user_id, gcal_watch_channel')
    .not('gcal_watch_channel', 'is', null);

  if (!data) return null;

  for (const row of data) {
    const ch = row.gcal_watch_channel as WatchChannel | null;
    if (ch?.channel_id === channelId) return row.user_id as string;
  }

  return null;
}

// ── Staleness helper ──────────────────────────────────────────────────────────

export function isCacheStale(fetchedAt: string | null | undefined, maxAgeMs: number): boolean {
  if (!fetchedAt) return true;
  return Date.now() - new Date(fetchedAt).getTime() > maxAgeMs;
}

// ── Cron: renew channels expiring within 24 h ─────────────────────────────────

export async function renewExpiringWatches(): Promise<void> {
  const { data } = await supabaseAdmin
    .from('user_settings')
    .select('user_id, gcal_watch_channel')
    .not('gcal_watch_channel', 'is', null);

  if (!data) return;

  const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  for (const row of data) {
    const ch = row.gcal_watch_channel as WatchChannel | null;
    if (ch && ch.expiry_at < cutoff) {
      const uid = row.user_id as string;
      await unregisterGcalWatch(uid);
      await registerGcalWatch(uid);
    }
  }
}
