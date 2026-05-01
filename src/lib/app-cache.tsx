'use client';

/**
 * AppDataProvider — shared client-side cache for frequently used data.
 *
 * Stale-while-revalidate semantics: reads return cached data immediately,
 * a background fetch refreshes it. Single in-flight request per key.
 *
 * Realtime: subscribes to Supabase Postgres Changes on both `todos` and
 * `calendar_cache` tables so updates from webhooks / cron are instant.
 *
 * Visibility refresh: when the tab becomes visible again after being hidden,
 * stale data is automatically refreshed.
 */

import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { idbGet, idbSet, IDB_KEYS } from '@/lib/idb';

const TZ = 'Australia/Melbourne';

function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

interface Plan { timeline?: unknown[]; top_priorities?: string[]; nudges?: unknown[]; warnings?: string[]; summary?: string; }
interface CalEvent { id: string; title: string; start: string; end: string; allDay: boolean; color: string | null; isDeadline?: boolean; description?: string; calendarId?: string; }
interface Briefing { summary?: string; days?: unknown[]; week_priorities?: string[]; }
interface Settings { setup_complete?: boolean; [k: string]: unknown; }
interface Health { checks?: { google?: { status?: string }; canvas?: { status?: string } }; }

interface AppCache {
  settings: Settings | null;
  health: Health | null;
  briefing: Briefing | null;
  calEvents: CalEvent[];
  plans: Record<string, Plan | null>;
  completions: Record<string, Set<string>>;
  ready: boolean;

  refreshPlan: (date: string) => Promise<void>;
  refreshCalendar: () => Promise<void>;
  refreshHealth: () => Promise<void>;
  invalidateAll: () => void;
  syncAll: () => Promise<void>;
  syncing: boolean;
}

const Ctx = createContext<AppCache | null>(null);

const inflight = new Map<string, Promise<unknown>>();
function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => { inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

const CACHE_TTL_MS = 60_000;

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [calEvents, setCalEvents] = useState<CalEvent[]>([]);
  const [plans, setPlans] = useState<Record<string, Plan | null>>({});
  const [completions, setCompletions] = useState<Record<string, Set<string>>>({});
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);

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

  const syncAll = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    lastFetched.current = {};
    try {
      await Promise.allSettled([
        fetch('/api/calendar?refresh=1').then(r => r.json()).then(r => {
          if (r?.events) { setCalEvents(r.events); markFresh('calendar'); }
        }),
        fetch('/api/canvas?refresh=1').then(() => {}),
        fetch('/api/health').then(r => r.json()).then(r => {
          if (r) { setHealth(r); markFresh('health'); }
        }),
        fetch(`/api/today?date=${todayISO()}`).then(r => r.json()).then(r => {
          if (r) {
            const today = todayISO();
            setPlans(p => ({ ...p, [today]: r.plan ?? null }));
            const ids: string[] = r.completed_ids || [];
            setCompletions(c => ({ ...c, [today]: new Set(ids) }));
            markFresh(`plan:${today}`);
          }
        }),
      ]);
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  // Hydrate from IndexedDB first, then warm up from server
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, h, b, c, pMap, cMap] = await Promise.all([
        idbGet<Settings>(IDB_KEYS.settings),
        idbGet<Health>(IDB_KEYS.health),
        idbGet<Briefing>(IDB_KEYS.briefing),
        idbGet<CalEvent[]>(IDB_KEYS.calEvents),
        idbGet<Record<string, Plan | null>>(IDB_KEYS.plans),
        idbGet<Record<string, string[]>>(IDB_KEYS.completions),
      ]);
      if (cancelled) return;
      if (s) setSettings(s);
      if (h) setHealth(h);
      if (b) setBriefing(b);
      if (c) setCalEvents(c);
      if (pMap) setPlans(pMap);
      if (cMap) {
        const asSets: Record<string, Set<string>> = {};
        for (const k of Object.keys(cMap)) asSets[k] = new Set(cMap[k]);
        setCompletions(asSets);
      }
      setReady(true);

      const today = todayISO();
      await Promise.allSettled([loadSettings(), loadHealth(), loadBriefing(), loadCalendar(), loadPlan(today)]);
    })();

    const onChange = () => { invalidateAll(); loadPlan(todayISO()); loadCalendar(); };
    window.addEventListener('cmd-data-changed', onChange);
    return () => {
      cancelled = true;
      window.removeEventListener('cmd-data-changed', onChange);
    };
  }, [loadSettings, loadHealth, loadBriefing, loadCalendar, loadPlan, invalidateAll]);

  // Persist each slice to IDB whenever it changes
  useEffect(() => { if (settings) idbSet(IDB_KEYS.settings, settings); }, [settings]);
  useEffect(() => { if (health) idbSet(IDB_KEYS.health, health); }, [health]);
  useEffect(() => { if (briefing) idbSet(IDB_KEYS.briefing, briefing); }, [briefing]);
  useEffect(() => { if (calEvents.length) idbSet(IDB_KEYS.calEvents, calEvents); }, [calEvents]);
  useEffect(() => { if (Object.keys(plans).length) idbSet(IDB_KEYS.plans, plans); }, [plans]);
  useEffect(() => {
    if (!Object.keys(completions).length) return;
    const serialisable: Record<string, string[]> = {};
    for (const k of Object.keys(completions)) serialisable[k] = Array.from(completions[k]);
    idbSet(IDB_KEYS.completions, serialisable);
  }, [completions]);

  // Supabase Realtime: todos + calendar_cache
  useEffect(() => {
    let cancelled = false;
    let cleanupFns: (() => void)[] = [];

    (async () => {
      const session = await fetch('/api/auth/session').then(r => r.json()).catch(() => null);
      const userId = session?.userId;
      if (!userId || cancelled) return;

      // Realtime on todos
      const todosChannel = supabase
        .channel(`todos-${userId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'todos', filter: `user_id=eq.${userId}` },
          (payload) => {
            const row = (payload.new || payload.old) as { date?: string; todo?: unknown } | undefined;
            if (!row?.date) return;
            const date = row.date;
            setPlans(p => ({
              ...p,
              [date]: (payload.new as { todo?: unknown })?.todo as Plan | null ?? null,
            }));
            lastFetched.current[`plan:${date}`] = Date.now();
          })
        .subscribe();

      // Realtime on calendar_cache — instant UI update when webhook sync writes new data
      const calChannel = supabase
        .channel(`cal-cache-${userId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'calendar_cache', filter: `user_id=eq.${userId}` },
          (payload) => {
            const fresh = (payload.new as { data: CalEvent[] })?.data;
            if (fresh) {
              setCalEvents(fresh);
              lastFetched.current['calendar'] = Date.now();
            }
          })
        .subscribe();

      cleanupFns.push(
        () => { void supabase.removeChannel(todosChannel); },
        () => { void supabase.removeChannel(calChannel); },
      );
    })();

    return () => {
      cancelled = true;
      cleanupFns.forEach(fn => fn());
    };
  }, []);

  // Visibility refresh: when tab becomes visible, refresh stale data
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (stale('calendar')) {
        lastFetched.current['calendar'] = 0;
        loadCalendar();
      }
      const today = todayISO();
      if (stale(`plan:${today}`)) {
        lastFetched.current[`plan:${today}`] = 0;
        loadPlan(today);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [loadCalendar, loadPlan]);

  const value = useMemo(() => ({
    settings, health, briefing, calEvents, plans, completions, ready,
    refreshPlan, refreshCalendar, refreshHealth, invalidateAll,
    syncAll, syncing,
  }), [settings, health, briefing, calEvents, plans, completions, ready,
      refreshPlan, refreshCalendar, refreshHealth, invalidateAll,
      syncAll, syncing]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppData(): AppCache {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAppData must be used inside AppDataProvider');
  return c;
}

export function usePlan(date: string): { plan: Plan | null; done: Set<string> } {
  const ctx = useAppData();
  const hasPlan = date in ctx.plans;
  const refresh = ctx.refreshPlan;
  useEffect(() => {
    if (!hasPlan) refresh(date);
  }, [date, hasPlan, refresh]);

  return useMemo(() => ({
    plan: ctx.plans[date] ?? null,
    done: ctx.completions[date] ?? new Set<string>(),
  }), [ctx.plans, ctx.completions, date]);
}
