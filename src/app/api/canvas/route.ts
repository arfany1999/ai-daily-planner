/**
 * /api/canvas — stale-while-revalidate Canvas endpoint
 *
 * Pattern (same as Google Calendar):
 *   1. Read from canvas_cache in Supabase → respond INSTANTLY
 *   2. If cache is stale (> 30 min) → fire-and-forget Canvas sync in background
 *   3. Supabase Realtime broadcasts the UPDATE → frontend updates automatically
 *
 * Canvas has no webhooks, so freshness relies on:
 *   • 30-min background refresh cycle (triggered by any user visiting the app)
 *   • Nightly cron which always refreshes before the user's morning
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';
import { syncCanvasToCache, isCanvasCacheStale } from '@/lib/canvas-sync';

export const GET = withAuth(async (_req, userId) => {
  // ── Step 1: Read from cache (instant) ────────────────────────────────────
  const { data: cached } = await supabaseAdmin
    .from('canvas_cache')
    .select('data, fetched_at')
    .eq('user_id', userId)
    .single();

  const fetchedAt = cached?.fetched_at as string | null | undefined;
  const stale = isCanvasCacheStale(fetchedAt);

  // ── Step 2: Background refresh if stale (non-blocking) ───────────────────
  if (stale) {
    void syncCanvasToCache(userId);
  }

  // ── Step 3: Respond immediately from cache ────────────────────────────────
  if (!cached?.data) {
    // First-ever load: trigger sync and return empty (frontend will retry)
    if (stale) {
      // syncCanvasToCache already fired above — frontend will pick it up via Realtime
    }
    return NextResponse.json({
      data: { courses: [], assignments: [], announcements: [] },
      stale: true,
      cached_at: null,
    });
  }

  return NextResponse.json({
    data: cached.data,
    stale,
    cached_at: fetchedAt || null,
  });
});

export const maxDuration = 10; // fast now — just reads from Supabase
