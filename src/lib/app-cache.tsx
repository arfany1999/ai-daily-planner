'use client';

/**
 * AppDataProvider — shared client-side cache for frequently used data.
 *
 * Why: every page was independently fetching /api/settings, /api/health,
 * /api/briefing, /api/today, /api/calendar on mount. That's 5+ requests
 * × 200-500ms each = multi-second tab switches. By sharing these across
 * the whole (app) tree, tab switches reuse cached data instantly and
 * revalidate in the background.
 *
 * Stale-while-revalidate semantics: reads return cached data immediately,
 * a background fetch refreshes it. Single in-flight request per key.
 */

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

const TZ = 'Australia/Melbourne';

function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

interface Plan { timeline?: unknown[]; top_priorities?: string[]; nudges?: unknown[]; warnings?: string[]; summary?: string; }
interface CalEvent { id: string; title: string; start: string; end: string; allDay: boolean; color: string | null; isDeadline?: boolean; description?: string; }
interface Briefing { summary?: string; days?: unknown[]; week_priorities?: string[]; }
interface Settings { setup_complete?: boolean; [k: string]: unknown; }
interface Health { checks?: { google?: { status?: string }; canvas?: { status?: string } }; }

interface AppCache {
  settings: Settings | null;
  health: Health | null;
  briefing: Briefing | null;
  calEvents: CalEvent[];
  plans: Record<string, Plan | null>;       // keyed by YYYY-MM-DD
  completions: Record<string, Set<string>>; // keyed by YYYY-MM-DD
  ready: boolean;

  refreshPlan: (date: string) => Promise<void>;
  refreshCalendar: () => Promise<void>;
  refreshHealth: () => Promise<void>;
  invalidateAll: () => void;
}

const Ctx = createContext<AppCache | null>(null);

// Single-flight: de-duplicate concurrent fetches for the same key
const inflight = new Map<string, Promise<unknown>>();
function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => { inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

const CACHE_TTL_MS = 60_000; // 60s — after that, fresh fetch on read

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [calEvents, setCalEvents] = useState<CalEvent[]>([]);
  const [plans, setPlans] = useState<Record<string, Plan | null>>({});
  const [completions, setCompletions] = useState<Record<string, Set<string>>>({});
  const [ready, setReady] = useState(false);

  const lastFetched = useRef<Record<string, number>>({});

  const stale = (key: string) => {
    const t = lastFetched.current[key];
    return !t || Date.now() - t > CACHE_TTL_MS;
  };
  const markFresh = (key: string) => { lastFetched.current[key] = Date.now(); };

  const loadSettings = useCallback(async () => {
    if (!stale('settings')) return;
    await once('settings', async () => {
      const r = await fetch('/api/settings').then(r => r.json()).catch(() => null);
      if (r) { setSettings(r); markFresh('settings'); }
    });
  }, []);

  const loadHealth = useCallback(async () => {
    if (!stale('health')) return;
    await once('health', async () => {
      const r = await fetch('/api/health').then(r => r.json()).catch(() => null);
      if (r) { setHealth(r); markFresh('health'); }
    });
  }, []);

  const loadBriefing = useCallback(async () => {
    if (!stale('briefing')) return;
    await once('briefing', async () => {
      const r = await fetch('/api/briefing').then(r => r.json()).catch(() => null);
      if (r?.briefing) { setBriefing(r.briefing); markFresh('briefing'); }
    });
  }, []);

  const loadCalendar = useCallback(async () => {
    if (!stale('calendar')) return;
    await once('calendar', async () => {
      const r = await fetch('/api/calendar').then(r => r.json()).catch(() => null);
      if (r?.events) { setCalEvents(r.events); markFresh('calendar'); }
    });
  }, []);

  const loadPlan = useCallback(async (date: string) => {
    const key = `plan:${date}`;
    if (!stale(key)) return;
    await once(key, async () => {
      const r = await fetch(`/api/today?date=${date}`).then(r => r.json()).catch(() => null);
      if (r) {
        setPlans(p => ({ ...p, [date]: r.plan ?? null }));
        const ids: string[] = r.completed_ids || [];
        setCompletions(c => ({ ...c, [date]: new Set(ids) }));
        markFresh(key);
      }
    });
  }, []);

  const refreshPlan = useCallback(async (date: string) => {
    lastFetched.current[`plan:${date}`] = 0;
    await loadPlan(date);
  }, [loadPlan]);

  const refreshCalendar = useCallback(async () => {
    lastFetched.current['calendar'] = 0;
    await loadCalendar();
  }, [loadCalendar]);

  const refreshHealth = useCallback(async () => {
    lastFetched.current['health'] = 0;
    await loadHealth();
  }, [loadHealth]);

  const invalidateAll = useCallback(() => {
    lastFetched.current = {};
  }, []);

  // Initial warm-up — fire all in parallel
  useEffect(() => {
    const today = todayISO();
    Promise.all([
      loadSettings(),
      loadHealth(),
      loadBriefing(),
      loadCalendar(),
      loadPlan(today),
    ]).finally(() => setReady(true));

    const onChange = () => { invalidateAll(); loadPlan(todayISO()); loadCalendar(); };
    window.addEventListener('cmd-data-changed', onChange);
    return () => window.removeEventListener('cmd-data-changed', onChange);
  }, [loadSettings, loadHealth, loadBriefing, loadCalendar, loadPlan, invalidateAll]);

  return (
    <Ctx.Provider value={{
      settings, health, briefing, calEvents, plans, completions, ready,
      refreshPlan, refreshCalendar, refreshHealth, invalidateAll,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAppData(): AppCache {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAppData must be used inside AppDataProvider');
  return c;
}

// Convenience hook: plan for a specific date, loads on demand
export function usePlan(date: string): { plan: Plan | null; done: Set<string> } {
  const ctx = useAppData();
  useEffect(() => {
    if (!(date in ctx.plans)) {
      ctx.refreshPlan(date);
    }
  }, [date, ctx]);
  return {
    plan: ctx.plans[date] ?? null,
    done: ctx.completions[date] ?? new Set<string>(),
  };
}
