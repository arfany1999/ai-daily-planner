/**
 * /api/calendar — stale-while-revalidate, zero new tables required
 *
 * 1. Read calendar_cache → respond instantly (< 50 ms)
 * 2. If stale (> 5 min) → background sync from Google
 * 3. Ensure Google webhook is registered (stored in user_settings JSONB)
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';
import { syncCalendarToCache, isCacheStale, registerGcalWatch } from '@/lib/gcal-sync';

const CALENDAR_MAX_AGE_MS   = 5 * 60 * 1000;        // 5 min → trigger background refresh
const WEBHOOK_RENEW_BEFORE  = 24 * 60 * 60 * 1000;  // 24 h before expiry → re-register

export const GET = withAuth(async (_req, userId) => {
  // ── 1. Instant read from cache ────────────────────────────────────────────
  const { data: cached } = await supabaseAdmin
    .from('calendar_cache')
    .select('data, fetched_at')
    .eq('user_id', userId)
    .single();

  const fetchedAt = cached?.fetched_at as string | null | undefined;
  const stale = isCacheStale(fetchedAt, CALENDAR_MAX_AGE_MS);

  // ── 2. Background refresh if stale ───────────────────────────────────────
  if (stale) void syncCalendarToCache(userId);

  // ── 3. Ensure webhook registered (stored in user_settings, no new table) ─
  const { data: settings } = await supabaseAdmin
    .from('user_settings')
    .select('gcal_watch_channel')
    .eq('user_id', userId)
    .single();

  const ch = settings?.gcal_watch_channel as { expiry_at?: string } | null;
  const needsWebhook = !ch?.expiry_at ||
    new Date(ch.expiry_at).getTime() - Date.now() < WEBHOOK_RENEW_BEFORE;

  if (needsWebhook) void registerGcalWatch(userId);

  // ── 4. Respond immediately ────────────────────────────────────────────────
  return NextResponse.json({
    events: (cached?.data as unknown[]) || [],
    stale,
    cached_at: fetchedAt || null,
  });
});
