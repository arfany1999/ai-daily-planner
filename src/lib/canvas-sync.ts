/**
 * Canvas LMS → Supabase mirror
 *
 * syncCanvasToCache() — pulls courses/assignments/announcements from Canvas,
 *                       writes to canvas_cache.
 *
 * Canvas has no webhooks, so we rely on:
 *   • Nightly cron   — guaranteed freshness by morning
 *   • Stale-while-revalidate — if cache is >30 min old, background refresh triggers
 */

import { fetchAllCanvasData, CanvasAuthError } from './canvas';
import { supabaseAdmin } from './supabase';
import { logError } from './db';

const CANVAS_CACHE_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

export async function syncCanvasToCache(userId: string): Promise<unknown | null> {
  try {
    const data = await fetchAllCanvasData(userId);

    await supabaseAdmin.from('canvas_cache').upsert(
      { user_id: userId, data, fetched_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );

    return data;
  } catch (err) {
    if (err instanceof CanvasAuthError) {
      // Auto-disconnect so the user knows their token needs refresh
      await supabaseAdmin.from('users').update({ canvas_connected: false }).eq('id', userId);
      await logError('canvas-sync', 'Canvas token expired — auto-disconnected', userId);
      return null;
    }
    await logError('canvas-sync', err instanceof Error ? err.message : 'Unknown', userId);
    return null;
  }
}

export function isCanvasCacheStale(fetchedAt: string | null | undefined): boolean {
  if (!fetchedAt) return true;
  return Date.now() - new Date(fetchedAt).getTime() > CANVAS_CACHE_MAX_AGE_MS;
}
