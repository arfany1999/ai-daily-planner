'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { T } from '@/lib/theme';

const TZ = 'Australia/Melbourne';

interface DayDensity { [iso: string]: { count: number; urgent?: boolean } }

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function melbNow() { return new Date(new Date().toLocaleString('en-US', { timeZone: TZ })); }

interface Props {
  selected?: string;
  onSelect?: (dateIso: string) => void;
  density?: DayDensity;
  daysBefore?: number;
  daysAfter?: number;
}

/**
 * Fantastical-style horizontal DayTicker.
 * - Shows a scrolling strip of days with density dots.
 * - Pinch / swipe friendly, keyboard ← → when focused.
 * - Emits `cmd-date-selected` CustomEvent alongside onSelect.
 */
export default function DayTicker({ selected, onSelect, density, daysBefore = 14, daysAfter = 90 }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayIso = isoDate(melbNow());
  const [activeIso, setActiveIso] = useState(selected || todayIso);
  const [loadedDensity, setLoadedDensity] = useState<DayDensity>(density || {});

  // Build day list
  const days = useMemo(() => {
    const out: { date: Date; iso: string }[] = [];
    const base = melbNow();
    base.setDate(base.getDate() - daysBefore);
    for (let i = 0; i < daysBefore + daysAfter + 1; i++) {
      const d = new Date(base); d.setDate(base.getDate() + i);
      out.push({ date: d, iso: isoDate(d) });
    }
    return out;
  }, [daysBefore, daysAfter]);

  // Fetch density from calendar API if not provided
  useEffect(() => {
    if (density) { setLoadedDensity(density); return; }
    let cancelled = false;
    fetch('/api/calendar')
      .then(r => r.json())
      .then((d: { events?: { start: string; isDeadline?: boolean }[] }) => {
        if (cancelled || !d.events) return;
        const map: DayDensity = {};
        for (const ev of d.events) {
          const iso = ev.start.slice(0, 10);
          if (!map[iso]) map[iso] = { count: 0 };
          map[iso].count++;
          if (ev.isDeadline) map[iso].urgent = true;
        }
        setLoadedDensity(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [density]);

  // Sync with prop
  useEffect(() => { if (selected) setActiveIso(selected); }, [selected]);

  // Auto-scroll to today on mount
  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current.querySelector<HTMLElement>(`[data-iso="${activeIso}"]`);
    if (el) el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' as ScrollBehavior });
  }, [activeIso]);

  const pick = (iso: string) => {
    setActiveIso(iso);
    onSelect?.(iso);
    window.dispatchEvent(new CustomEvent('cmd-date-selected', { detail: iso }));
    if (pathname === '/calendar' || pathname?.startsWith('/calendar')) {
      router.replace(`/calendar?d=${iso}`);
    }
  };

  // Group by month for month label overlay
  const monthBadges = useMemo(() => {
    const seen = new Set<string>();
    return days.map(d => {
      const key = `${d.date.getFullYear()}-${d.date.getMonth()}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return d.iso;
    });
  }, [days]);

  return (
    <div className="dayticker anim-fade">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div className="title-display" style={{ fontSize: 18, fontWeight: 700, color: T.text, letterSpacing: '-0.03em' }}>
            {new Date(activeIso + 'T00:00:00').toLocaleDateString('en-AU', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <div style={{ fontSize: 10.5, color: T.textFaint, marginTop: 1, fontWeight: 500 }}>
            {activeIso === todayIso ? 'Today' :
              Math.abs(Math.round((new Date(activeIso + 'T00:00:00').getTime() - new Date(todayIso + 'T00:00:00').getTime()) / 86400000)) + ' day' +
              (Math.abs(Math.round((new Date(activeIso + 'T00:00:00').getTime() - new Date(todayIso + 'T00:00:00').getTime()) / 86400000)) === 1 ? '' : 's') +
              (new Date(activeIso) > new Date(todayIso) ? ' ahead' : ' ago')}
          </div>
        </div>
        <button
          onClick={() => pick(todayIso)}
          style={{
            padding: '5px 11px', borderRadius: 8,
            background: activeIso === todayIso ? 'var(--teal-glow)' : 'var(--surface)',
            border: '1px solid ' + (activeIso === todayIso ? 'var(--teal-brd)' : 'var(--border)'),
            color: activeIso === todayIso ? T.teal : T.textSoft,
            fontSize: 10.5, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.02em',
            transition: 'all 0.15s',
          }}
        >Today</button>
      </div>

      <div
        ref={scrollRef}
        style={{
          display: 'flex', gap: 4, overflowX: 'auto', overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          scrollBehavior: 'smooth',
          paddingBottom: 2,
          maskImage: 'linear-gradient(to right, transparent 0, black 16px, black calc(100% - 16px), transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0, black 16px, black calc(100% - 16px), transparent 100%)',
        }}
      >
        {days.map(({ date, iso }, idx) => {
          const isToday = iso === todayIso;
          const isSel = iso === activeIso;
          const dens = loadedDensity[iso];
          const count = dens?.count || 0;
          const urgent = dens?.urgent;
          const dots = Math.min(count, 3);
          const monthBadge = monthBadges[idx];

          return (
            <button key={iso}
              data-iso={iso}
              onClick={() => pick(iso)}
              style={{
                position: 'relative',
                flex: '0 0 auto',
                width: 52, minHeight: 60,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 2,
                padding: '6px 4px',
                borderRadius: 12,
                border: '1px solid ' + (isSel ? 'var(--teal-brd)' : 'transparent'),
                background: isSel ? 'var(--teal-glow)' : isToday ? 'var(--surface)' : 'transparent',
                cursor: 'pointer',
                scrollSnapAlign: 'center',
                transition: 'all 0.22s var(--ease-spring)',
                transform: isSel ? 'scale(1.02)' : 'scale(1)',
              }}
            >
              {monthBadge && (
                <span style={{
                  position: 'absolute', top: -22, left: 0,
                  fontSize: 9, fontWeight: 700, color: T.textFaint,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>
                  {date.toLocaleDateString('en-AU', { month: 'short' })}
                </span>
              )}
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: isSel ? T.teal : isToday ? T.textSoft : T.textFaint,
              }}>
                {date.toLocaleDateString('en-AU', { weekday: 'short' }).slice(0, 3)}
              </span>
              <span className="title-display" style={{
                fontSize: 20, fontWeight: 700,
                color: isSel ? T.teal : isToday ? T.text : T.textSoft,
                letterSpacing: '-0.03em', lineHeight: 1,
              }}>
                {date.getDate()}
              </span>
              <div style={{ height: 6, display: 'flex', gap: 2, alignItems: 'center' }}>
                {Array.from({ length: dots }).map((_, i) => (
                  <div key={i} style={{
                    width: 3, height: 3, borderRadius: '50%',
                    background: urgent && i === 0 ? 'var(--red)' : isSel ? T.teal : 'var(--text-muted)',
                    opacity: 0.85,
                  }}/>
                ))}
                {count > 3 && (
                  <div className="mono" style={{ fontSize: 8, color: T.textFaint, marginLeft: 1 }}>+{count - 3}</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
