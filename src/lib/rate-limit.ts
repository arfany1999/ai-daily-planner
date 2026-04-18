/**
 * Tiny in-memory rate limiter — single instance per Vercel serverless invocation.
 * Not bullet-proof across warm→cold cycles or horizontal scaling, but enough
 * to blunt runaway users in the 99% case. For harder guarantees move to
 * a Supabase RPC or Upstash Redis later.
 */

const store = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (store.get(key) || []).filter(t => t > cutoff);

  if (hits.length >= limit) {
    store.set(key, hits);
    const oldest = hits[0];
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, windowMs - (now - oldest)) };
  }

  hits.push(now);
  store.set(key, hits);
  // GC: occasionally prune empty arrays so the map doesn't grow forever
  if (store.size > 10_000 && Math.random() < 0.01) {
    for (const [k, arr] of store) {
      const fresh = arr.filter(t => t > cutoff);
      if (fresh.length === 0) store.delete(k);
      else store.set(k, fresh);
    }
  }
  return { allowed: true, remaining: limit - hits.length, retryAfterMs: 0 };
}

/**
 * Convenience — per-user + per-endpoint budgets tuned for AI cost control.
 * Agent: 40/min (enough for a real session, blocks spam)
 * Ask stream: 30/min
 * Parse: 120/min (cheap — Haiku, fine to hit often)
 */
export const RATE_LIMITS = {
  agent: { limit: 40, windowMs: 60_000 },
  ask: { limit: 30, windowMs: 60_000 },
  parse: { limit: 120, windowMs: 60_000 },
  reschedule: { limit: 30, windowMs: 60_000 },
};
