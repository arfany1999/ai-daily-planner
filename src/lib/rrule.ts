type ParsedRRule = {
  freq: string; interval: number; byday?: string[]; count?: number; until?: string;
};

export function parseRRule(rrule: string): ParsedRRule {
  const parts = rrule.replace(/^RRULE:/i, '').split(';');
  const map = new Map<string, string>();
  for (const p of parts) {
    const [k, v] = p.split('=');
    if (k && v) map.set(k.toUpperCase(), v);
  }
  return {
    freq: map.get('FREQ') ?? 'DAILY',
    interval: parseInt(map.get('INTERVAL') ?? '1', 10),
    byday: map.get('BYDAY')?.split(','),
    count: map.has('COUNT') ? parseInt(map.get('COUNT')!, 10) : undefined,
    until: map.get('UNTIL'),
  };
}

const DAY_MAP: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getNextOccurrence(rrule: string, lastDate: string): string | null {
  const rule = parseRRule(rrule);
  const last = new Date(lastDate + 'T00:00:00');
  let next: Date;

  if (rule.freq === 'DAILY') {
    next = addDays(last, rule.interval);
  } else if (rule.freq === 'WEEKLY') {
    if (rule.byday && rule.byday.length > 0) {
      const targetDays = rule.byday.map((d) => DAY_MAP[d]).filter((n) => n !== undefined);
      let candidate = addDays(last, 1);
      const maxSearch = rule.interval * 7;
      let found = false;
      for (let i = 0; i < maxSearch; i++) {
        if (targetDays.includes(candidate.getDay())) {
          const weekDiff = Math.floor((candidate.getTime() - last.getTime()) / (7 * 86400000));
          if (rule.interval <= 1 || weekDiff < 1 || weekDiff % rule.interval === 0) {
            next = candidate;
            found = true;
            break;
          }
        }
        candidate = addDays(candidate, 1);
      }
      if (!found) return null;
      next = candidate;
    } else {
      next = addDays(last, 7 * rule.interval);
    }
  } else if (rule.freq === 'MONTHLY') {
    next = new Date(last);
    next.setMonth(next.getMonth() + rule.interval);
  } else if (rule.freq === 'YEARLY') {
    next = new Date(last);
    next.setFullYear(next.getFullYear() + rule.interval);
  } else {
    return null;
  }

  if (rule.until && toISO(next) > rule.until.slice(0, 10)) return null;
  return toISO(next);
}
