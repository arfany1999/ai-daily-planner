import { supabaseAdmin } from './supabase';

export const DEFAULT_TZ = 'Australia/Melbourne';

const tzCache = new Map<string, { tz: string; ts: number }>();
const TZ_CACHE_TTL = 10 * 60_000;

/**
 * Resolve a user's timezone. Reads from `user_settings.timezone`, falls back
 * to the project default. 10-minute in-memory cache — timezone rarely
 * changes and we hit this on every request that stamps a date.
 */
export async function getUserTimezone(userId: string): Promise<string> {
  const cached = tzCache.get(userId);
  if (cached && Date.now() - cached.ts < TZ_CACHE_TTL) return cached.tz;

  try {
    const { data } = await supabaseAdmin
      .from('user_settings')
      .select('timezone')
      .eq('user_id', userId)
      .single();
    const tz = (data?.timezone as string | undefined)?.trim() || DEFAULT_TZ;
    tzCache.set(userId, { tz, ts: Date.now() });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

export function todayISOFor(tz: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}

export function tomorrowISOFor(tz: string): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-CA', { timeZone: tz });
}

/** Clear TZ cache (called when user updates their settings). */
export function invalidateTimezone(userId: string) {
  tzCache.delete(userId);
}
