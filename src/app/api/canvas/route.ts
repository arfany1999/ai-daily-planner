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

export const GET = withAuth(async (req, userId) => {
  const url = new URL(req.url);
  const forceRefresh = url.searchParams.get('refresh') === '1';

  // ── Step 0: Is the user connected? ───────────────────────────────────────
  // `connected === false` tells the frontend to show the Connect prompt
  // instead of an empty "0 courses / 0 deadlines" state.
  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('canvas_token, canvas_connected')
    .eq('id', userId)
    .single();
  const connected = Boolean(userRow?.canvas_token) || Boolean(userRow?.canvas_connected);

  if (!connected) {
    return NextResponse.json({
      connected: false,
      data: null,
      stale: false,
      cached_at: null,
    }, { headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=60' } });
  }

  // Force refresh path — waits for the sync before responding, bypasses cache.
  if (forceRefresh) {
    try {
      const fresh = await syncCanvasToCache(userId);
      return NextResponse.json({
        connected: true,
        data: fresh || { courses: [], assignments: [], quizzes: [], announcements: [], events: [] },
        stale: false,
        cached_at: new Date().toISOString(),
      }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (e) {
      return NextResponse.json({
        connected: true,
        data: null,
        stale: true,
        error: e instanceof Error ? e.message : 'sync-failed',
      }, { status: 500 });
    }
  }

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
    return NextResponse.json({
      connected: true,
      data: { courses: [], assignments: [], announcements: [] },
      stale: true,
      cached_at: null,
    }, { headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=60' } });
  }

  return NextResponse.json({
    connected: true,
    data: cached.data,
    stale,
    cached_at: fetchedAt || null,
  }, { headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=600' } });
});

export const maxDuration = 10; // fast now — just reads from Supabase
