export interface ParsedQuickAdd {
  title: string;
  due_date?: string;
  due_time?: string;
  priority?: 0 | 1 | 2 | 3;
  tags?: string[];
  recurrence?: string;
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function melbourneToday(): Date {
  const str = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmt(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function nextWeekday(dayIndex: number, skipThisWeek: boolean): Date {
  const today = melbourneToday();
  const currentDay = today.getDay();
  let diff = dayIndex - currentDay;
  if (diff <= 0 || (diff === 0 && skipThisWeek)) diff += 7;
  if (skipThisWeek && diff <= 7) diff += 7;
  const result = new Date(today);
  result.setDate(today.getDate() + diff);
  return result;
}

export function parseQuickAdd(input: string): ParsedQuickAdd {
  let text = input.trim();
  const result: ParsedQuickAdd = { title: '' };
  const removals: { start: number; end: number }[] = [];

  const tag = /#(\w+)/g;
  let m: RegExpExecArray | null;
  const tags: string[] = [];
  while ((m = tag.exec(text)) !== null) {
    tags.push(m[1]);
    removals.push({ start: m.index, end: m.index + m[0].length });
  }
  if (tags.length) result.tags = tags;

  const recPatterns = [
    { rx: /\bevery\s+(\d+)\s+weeks?\b/i, fn: (m: RegExpMatchArray) => `FREQ=WEEKLY;INTERVAL=${m[1]}` },
    { rx: /\bevery\s+day\b/i, fn: () => 'FREQ=DAILY;INTERVAL=1' },
    { rx: /\bevery\s+week\b/i, fn: () => 'FREQ=WEEKLY;INTERVAL=1' },
    { rx: /\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, fn: (m: RegExpMatchArray) => {
      const d = m[1].toLowerCase();
      const by = d.slice(0, 2).toUpperCase();
      return `FREQ=WEEKLY;BYDAY=${by}`;
    }},
  ];
  for (const p of recPatterns) {
    const rm = text.match(p.rx);
    if (rm) {
      result.recurrence = p.fn(rm);
      const idx = text.indexOf(rm[0]);
      removals.push({ start: idx, end: idx + rm[0].length });
      break;
    }
  }

  const prioExcl = text.match(/(?:^|\s)(!!!|!!|!)(?:\s|$)/);
  if (prioExcl) {
    const level = prioExcl[1].length as 1 | 2 | 3;
    result.priority = level;
    const idx = text.indexOf(prioExcl[0]);
    removals.push({ start: idx, end: idx + prioExcl[0].length });
  } else {
    const prioP = text.match(/\bp([1-3])\b/i);
    if (prioP) {
      result.priority = Number(prioP[1]) as 1 | 2 | 3;
      const idx = text.indexOf(prioP[0]);
      removals.push({ start: idx, end: idx + prioP[0].length });
    }
  }

  const timeRx = /(?:@|at)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?|\b(\d{1,2})(am|pm)\b/i;
  const tm = text.match(timeRx);
  if (tm) {
    let h = Number(tm[1] ?? tm[4]);
    const min = tm[2] ? Number(tm[2]) : 0;
    const ampm = (tm[3] ?? tm[5] ?? '').toLowerCase();
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    result.due_time = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    const idx = text.indexOf(tm[0]);
    removals.push({ start: idx, end: idx + tm[0].length });
  }

  const today = melbourneToday();

  const datePatterns: { rx: RegExp; resolve: (m: RegExpMatchArray) => string }[] = [
    { rx: /\btoday\b/i, resolve: () => fmt(today) },
    { rx: /\btomorrow\b/i, resolve: () => { const d = new Date(today); d.setDate(d.getDate() + 1); return fmt(d); }},
    { rx: /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, resolve: (m) => {
      const di = DAY_NAMES.indexOf(m[1].toLowerCase());
      return fmt(nextWeekday(di, true));
    }},
    { rx: new RegExp(`\\b(${DAY_NAMES.join('|')})\\b`, 'i'), resolve: (m) => {
      const di = DAY_NAMES.indexOf(m[1].toLowerCase());
      return fmt(nextWeekday(di, false));
    }},
    { rx: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, resolve: (m) => `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` },
    { rx: /\b(\d{1,2})\/(\d{1,2})\b/, resolve: (m) => {
      const day = Number(m[1]), month = Number(m[2]) - 1;
      const d = new Date(today.getFullYear(), month, day);
      if (d < today) d.setFullYear(d.getFullYear() + 1);
      return fmt(d);
    }},
    { rx: new RegExp(`\\b(${MONTH_NAMES.join('|')})\\s+(\\d{1,2})\\b`, 'i'), resolve: (m) => {
      const month = MONTH_NAMES.indexOf(m[1].toLowerCase());
      const day = Number(m[2]);
      const d = new Date(today.getFullYear(), month, day);
      if (d < today) d.setFullYear(d.getFullYear() + 1);
      return fmt(d);
    }},
  ];

  for (const p of datePatterns) {
    const dm = text.match(p.rx);
    if (dm) {
      result.due_date = p.resolve(dm);
      const idx = text.indexOf(dm[0]);
      removals.push({ start: idx, end: idx + dm[0].length });
      break;
    }
  }

  removals.sort((a, b) => b.start - a.start);
  for (const r of removals) {
    text = text.slice(0, r.start) + text.slice(r.end);
  }
  result.title = text.replace(/\s{2,}/g, ' ').trim();

  return result;
}
