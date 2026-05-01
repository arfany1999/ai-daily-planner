/**
 * Google Calendar → Supabase mirror
 *
 * Syncs ALL visible calendars (not just primary) with incremental sync (syncToken).
 * Channel state is stored in user_settings.gcal_watch_channel (JSONB).
 *
 * syncCalendarToCache()  — incremental sync with full-sync fallback, all calendars
 * registerGcalWatch()    — subscribes to Google Calendar push notifications
 * unregisterGcalWatch()  — stops the push channel
 * renewExpiringWatches() — renews channels expiring within 24 h (called by cron)
 */

import { getCalendarService } from './google';
import { supabaseAdmin } from './supabase';
import { logError } from './db';

const TIMEZONE = 'Australia/Melbourne';
const LOOK_AHEAD_DAYS = 30;

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
  calendarId?: string;
}

interface WatchChannel {
  channel_id: string;
  resource_id: string;
  calendar_id: string;
  expiry_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapEvent(
  ev: { id?: string | null; summary?: string | null; description?: string | null; location?: string | null; start?: { dateTime?: string | null; date?: string | null } | null; end?: { dateTime?: string | null; date?: string | null } | null; colorId?: string | null; status?: string | null },
  calendarId?: string
): MirroredEvent {
  return {
    id: ev.id ?? crypto.randomUUID(),
    title: ev.summary || 'Untitled',
    description: ev.description || '',
    location: ev.location || '',
    start: ev.start?.dateTime || ev.start?.date || '',
    end: ev.end?.dateTime || ev.end?.date || '',
    allDay: !ev.start?.dateTime,
    color: ev.colorId || null,
    status: ev.status ?? undefined,
    calendarId,
  };
}

async function getVisibleCalendarIds(userId: string): Promise<string[]> {
  try {
    const calendar = await getCalendarService(userId);
    const res = await calendar.calendarList.list({ minAccessRole: 'reader' });
    const items = res.data.items || [];
    return items
      .filter(c => c.selected !== false)
      .map(c => c.id!)
      .filter(Boolean);
  } catch {
    return ['primary'];
  }
}

// ── Core sync (incremental via syncToken, full-sync fallback) ────────────────

export async function syncCalendarToCache(userId: string): Promise<MirroredEvent[]> {
  try {
    const { data: cached } = await supabaseAdmin
      .from('calendar_cache')
      .select('data, fetched_at, sync_token')
      .eq('user_id', userId)
      .single();

    const savedTokens = (cached?.sync_token as Record<string, string>) || null;
    const existingEvents: MirroredEvent[] = (cached?.data as MirroredEvent[]) || [];

    if (savedTokens && Object.keys(savedTokens).length > 0) {
      try {
        return await incrementalSync(userId, savedTokens, existingEvents);
      } catch (err) {
        const status = (err as { code?: number })?.code;
        if (status !== 410) {
          await logError('gcal-sync/incremental', err instanceof Error ? err.message : 'Unknown', userId);
        }
      }
    }

    return await fullSync(userId);
  } catch (err) {
    await logError('gcal-sync', err instanceof Error ? err.message : 'Unknown', userId);
    return [];
  }
}

async function fullSync(userId: string): Promise<MirroredEvent[]> {
  const calendar = await getCalendarService(userId);
  const calendarIds = await getVisibleCalendarIds(userId);

  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + LOOK_AHEAD_DAYS);

  let allItems: MirroredEvent[] = [];
  const syncTokens: Record<string, string> = {};

  for (const calId of calendarIds) {
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;

    try {
      do {
        const res = await calendar.events.list({
          calendarId: calId,
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
          timeZone: TIMEZONE,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 250,
          pageToken,
        });

        allItems = allItems.concat(
          (res.data.items || []).map(ev => mapEvent(ev, calId))
        );
        pageToken = res.data.nextPageToken ?? undefined;
        nextSyncToken = res.data.nextSyncToken ?? undefined;
      } while (pageToken);

      if (nextSyncToken) syncTokens[calId] = nextSyncToken;
    } catch (err) {
      await logError('gcal-sync/full-cal', `${calId}: ${err instanceof Error ? err.message : 'Unknown'}`, userId);
    }
  }

  await supabaseAdmin.from('calendar_cache').upsert(
    {
      user_id: userId,
      data: allItems,
      fetched_at: new Date().toISOString(),
      sync_token: syncTokens,
    },
    { onConflict: 'user_id' }
  );

  return allItems;
}

async function incrementalSync(
  userId: string,
  syncTokens: Record<string, string>,
  existing: MirroredEvent[]
): Promise<MirroredEvent[]> {
  const calendar = await getCalendarService(userId);
  const calendarIds = await getVisibleCalendarIds(userId);
  const newTokens: Record<string, string> = { ...syncTokens };

  const eventsMap = new Map(
    existing.map(e => [`${e.calendarId || 'primary'}:${e.id}`, e])
  );

  for (const calId of calendarIds) {
    const token = syncTokens[calId];
    if (!token) {
      // No token for this calendar — full fetch for just this one
      const now = new Date();
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(end.getDate() + LOOK_AHEAD_DAYS);

      let pageToken: string | undefined;
      try {
        do {
          const res = await calendar.events.list({
            calendarId: calId,
            timeMin: start.toISOString(),
            timeMax: end.toISOString(),
            timeZone: TIMEZONE,
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 250,
            pageToken,
          });
          for (const item of res.data.items || []) {
            if (!item.id) continue;
            eventsMap.set(`${calId}:${item.id}`, mapEvent(item, calId));
          }
          pageToken = res.data.nextPageToken ?? undefined;
          if (res.data.nextSyncToken) newTokens[calId] = res.data.nextSyncToken;
        } while (pageToken);
      } catch { /* skip this calendar on error */ }
      continue;
    }

    try {
      let pageToken: string | undefined;
      do {
        const res = await calendar.events.list({
          calendarId: calId,
          syncToken: token,
          pageToken,
        });

        for (const item of res.data.items || []) {
          if (!item.id) continue;
          const key = `${calId}:${item.id}`;
          if (item.status === 'cancelled') {
            eventsMap.delete(key);
          } else {
            eventsMap.set(key, mapEvent(item, calId));
          }
        }

        pageToken = res.data.nextPageToken ?? undefined;
        if (res.data.nextSyncToken) newTokens[calId] = res.data.nextSyncToken;
      } while (pageToken);
    } catch (err) {
      const code = (err as { code?: number })?.code;
      if (code === 410) {
        delete newTokens[calId];
      }
      throw err;
    }
  }

  // Remove events from calendars no longer visible
  const visibleSet = new Set(calendarIds);
  for (const key of eventsMap.keys()) {
    const calId = key.split(':')[0];
    if (!visibleSet.has(calId) && calId !== 'primary') {
      eventsMap.delete(key);
    }
  }

  const merged = Array.from(eventsMap.values());

  await supabaseAdmin.from('calendar_cache').upsert(
    {
      user_id: userId,
      data: merged,
      fetched_at: new Date().toISOString(),
      sync_token: newTokens,
    },
    { onConflict: 'user_id' }
  );

  return merged;
}

// ── Webhook registration ─────────────────────────────────────────────────────

export async function registerGcalWatch(userId: string): Promise<void> {
  const webhookUrl = process.env.NEXTAUTH_URL
    ? `${process.env.NEXTAUTH_URL}/api/webhooks/gcal`
    : null;

  if (!webhookUrl) return;

  try {
    const calendar = await getCalendarService(userId);
    const channelId = crypto.randomUUID();
    const expiryMs = Date.now() + 6 * 24 * 60 * 60 * 1000;

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

// ── Webhook receiver helper ──────────────────────────────────────────────────

export async function getUserByChannelId(channelId: string): Promise<string | null> {
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

// ── Cron: renew channels expiring within 24 h ────────────────────────────────

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
