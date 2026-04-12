/**
 * Intelligence Engine — 5-Layer Analysis
 *
 * Layer 1: Deep ingestion (structured meaning extraction per source)
 * Layer 2: Event inference (chain-of-thought across sources)
 * Layer 3: Gap detection (what's missing, not just what's there)
 * Layer 4: Confidence scoring (how sure we are about each inference)
 * Layer 5: Proactive surface (prioritized report ready before user asks)
 */

import { supabaseAdmin } from './supabase';

const TIMEZONE = 'Australia/Melbourne';

// ── Raw cache types (mirrored from context-builder) ──────────────────────────
type CalEvent = {
  id?: string;
  title?: string;
  summary?: string;
  start?: string | { dateTime?: string; date?: string };
  end?: string | { dateTime?: string; date?: string };
  description?: string;
  location?: string;
};
type Assignment = {
  name: string;
  course_name: string;
  due_at: string | null;
  has_submitted_submissions: boolean;
  description?: string;
  points_possible?: number;
};
type Announcement = {
  title: string;
  course_name: string;
  message?: string;
  posted_at?: string;
};
type Email = {
  from?: string;
  subject?: string;
  snippet?: string;
  date?: string;
};

// ── Public types ─────────────────────────────────────────────────────────────

export type EventType =
  | 'quiz'
  | 'exam'
  | 'assignment'
  | 'lab'
  | 'lecture'
  | 'tutorial'
  | 'project'
  | 'presentation'
  | 'deadline'
  | 'other';

export interface ExtractedEvent {
  source: 'calendar' | 'canvas_assignment' | 'canvas_announcement' | 'email';
  courseCode: string | null;
  courseName: string | null;
  eventType: EventType;
  title: string;
  dateStr: string | null;
  daysUntil: number | null;
  urgencyWords: string[];
  rawText: string;
  confidence: number;
}

export interface InferredEvent {
  eventType: EventType;
  courseCode: string | null;
  courseName: string | null;
  title: string;
  dateStr: string | null;
  daysUntil: number | null;
  confidence: number;
  confidenceLabel: string;
  sources: ExtractedEvent[];
  gaps: string[];
  actionSuggestion: string | null;
}

export interface Gap {
  severity: 'critical' | 'warning' | 'info';
  category:
    | 'missing_study_block'
    | 'missing_material'
    | 'unconfirmed_exam'
    | 'email_deadline'
    | 'overdue'
    | 'conflict';
  courseCode: string | null;
  courseName: string | null;
  description: string;
  suggestedAction: string;
}

export interface CourseIntelligence {
  courseCode: string | null;
  courseName: string;
  upcomingEvents: InferredEvent[];
  recentAnnouncements: ExtractedEvent[];
  recentEmails: ExtractedEvent[];
  gaps: Gap[];
  urgencyScore: number;
}

export interface IntelligenceReport {
  generatedAt: string;
  targetDate: string;
  confirmedEvents: InferredEvent[];
  inferencedEvents: InferredEvent[];
  uncertainEvents: InferredEvent[];
  gaps: Gap[];
  courseMap: Record<string, CourseIntelligence>;
  prioritizedAlerts: string[];
  rawSummary: string;
}

// ── Layer 1 helpers ──────────────────────────────────────────────────────────

/** Extract a course code like BIOL2368, PHAR1035, etc. */
export function extractCourseCode(text: string): string | null {
  const match = text.match(/\b([A-Z]{3,4}\d{4})\b/);
  return match ? match[1] : null;
}

/** Classify event type from free text. */
export function extractEventType(text: string): EventType {
  const t = text.toLowerCase();
  if (/\bquiz\b|mcq|multiple.?choice/.test(t)) return 'quiz';
  if (/\b(exam|final|mid.?semester|midsem)\b/.test(t)) return 'exam';
  if (/\b(lab|practical)\b/.test(t)) return 'lab';
  if (/\b(tutorial|tut\b)/.test(t)) return 'tutorial';
  if (/\blecture\b/.test(t)) return 'lecture';
  if (/\b(assignment|submission|report)\b/.test(t)) return 'assignment';
  if (/\bproject\b/.test(t)) return 'project';
  if (/\b(presentation|present)\b/.test(t)) return 'presentation';
  if (/\b(due|deadline)\b/.test(t)) return 'deadline';
  return 'other';
}

/** Extract urgency indicator phrases. */
export function extractUrgencyWords(text: string): string[] {
  const found: string[] = [];
  const patterns: RegExp[] = [
    /this\s+friday/gi,
    /this\s+week/gi,
    /tomorrow/gi,
    /next\s+week/gi,
    /don['']?t\s+forget/gi,
    /reminder/gi,
    /\bimportant\b/gi,
    /\burgent\b/gi,
    /due\s+soon/gi,
    /coming\s+up/gi,
  ];
  for (const p of patterns) {
    const matches = text.match(p);
    if (matches) found.push(...matches.map((m) => m.toLowerCase()));
  }
  return [...new Set(found)];
}

/** Strip HTML tags and entities, returning plain text. */
function cleanHtml(html: string, maxLen = 800): string {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/** Parse the start date of a calendar event to a Date. */
function calEventDate(e: CalEvent): Date | null {
  const raw =
    typeof e.start === 'string'
      ? e.start
      : e.start?.dateTime || e.start?.date || '';
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

/** Days between baseDate (start of day) and target. Negative = past. */
function daysFrom(base: Date, target: Date): number {
  const msPerDay = 86_400_000;
  const baseDay = new Date(base.toLocaleDateString('en-CA', { timeZone: TIMEZONE }) + 'T00:00:00');
  const targetDay = new Date(target.toLocaleDateString('en-CA', { timeZone: TIMEZONE }) + 'T00:00:00');
  return Math.round((targetDay.getTime() - baseDay.getTime()) / msPerDay);
}

/** Build a confidence label string. */
function confidenceLabel(c: number): string {
  const pct = Math.round(c * 100);
  if (c >= 0.8) return `High (${pct}%)`;
  if (c >= 0.5) return `Medium (${pct}%)`;
  return `Low (${pct}%)`;
}

// ── Layer 1: Natural date extraction ─────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Extract a date from natural language (best-effort).
 * Returns ISO string (YYYY-MM-DD) and daysUntil from baseDate.
 */
export function extractNaturalDates(
  text: string,
  baseDate: Date,
): { dateStr: string; daysUntil: number } | null {
  const t = text.toLowerCase();

  // Helper: format a Date as YYYY-MM-DD (local, Melbourne)
  const toISO = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TIMEZONE });

  // "tomorrow"
  if (/\btomorrow\b/.test(t)) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + 1);
    return { dateStr: toISO(d), daysUntil: 1 };
  }

  // "this <weekday>" or "next <weekday>"
  for (const [idx, name] of DAY_NAMES.entries()) {
    const thisMatch = new RegExp(`\\bthis\\s+${name}\\b`).test(t);
    const nextMatch = new RegExp(`\\bnext\\s+${name}\\b`).test(t);
    if (thisMatch || nextMatch) {
      const baseDay = baseDate.getDay();
      let diff = idx - baseDay;
      if (diff <= 0) diff += 7; // always forward
      if (nextMatch && diff < 7) diff += 7; // "next" means at least 7 days
      const d = new Date(baseDate);
      d.setDate(d.getDate() + diff);
      return { dateStr: toISO(d), daysUntil: diff };
    }
  }

  // Plain weekday name without "this"/"next" (e.g. "on Friday")
  for (const [idx, name] of DAY_NAMES.entries()) {
    if (new RegExp(`\\bon\\s+${name}\\b|\\b${name}\\b`).test(t)) {
      const baseDay = baseDate.getDay();
      let diff = idx - baseDay;
      if (diff <= 0) diff += 7;
      const d = new Date(baseDate);
      d.setDate(d.getDate() + diff);
      return { dateStr: toISO(d), daysUntil: diff };
    }
  }

  // "April 17" or "17 April"
  for (const [abbr, monthIdx] of Object.entries(MONTH_MAP)) {
    const re1 = new RegExp(`${abbr}[a-z]*\\s+(\\d{1,2})`, 'i');
    const re2 = new RegExp(`(\\d{1,2})\\s+${abbr}[a-z]*`, 'i');
    const m1 = text.match(re1);
    const m2 = text.match(re2);
    const dayNum = m1 ? parseInt(m1[1]) : m2 ? parseInt(m2[1]) : null;
    if (dayNum !== null && dayNum >= 1 && dayNum <= 31) {
      const year = baseDate.getFullYear();
      const candidate = new Date(year, monthIdx, dayNum);
      // If that date is already past by more than 30 days, try next year
      const diff = daysFrom(baseDate, candidate);
      const finalDate = diff < -30 ? new Date(year + 1, monthIdx, dayNum) : candidate;
      const finalDiff = daysFrom(baseDate, finalDate);
      return { dateStr: toISO(finalDate), daysUntil: finalDiff };
    }
  }

  // ISO/numeric: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const d = new Date(isoMatch[0]);
    if (!isNaN(d.getTime())) {
      return { dateStr: toISO(d), daysUntil: daysFrom(baseDate, d) };
    }
  }
  const numMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (numMatch) {
    const day = parseInt(numMatch[1]);
    const month = parseInt(numMatch[2]) - 1;
    const year = numMatch[3]
      ? numMatch[3].length === 2
        ? 2000 + parseInt(numMatch[3])
        : parseInt(numMatch[3])
      : baseDate.getFullYear();
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      return { dateStr: toISO(d), daysUntil: daysFrom(baseDate, d) };
    }
  }

  return null;
}

// ── Layer 1: Ingestor functions ───────────────────────────────────────────────

/** Source-confidence baselines */
const SOURCE_BASELINE: Record<ExtractedEvent['source'], number> = {
  canvas_assignment: 0.85,
  canvas_announcement: 0.70,
  calendar: 0.65,
  email: 0.50,
};

export function ingestCalendar(events: CalEvent[], baseDate: Date): ExtractedEvent[] {
  return events.flatMap((e): ExtractedEvent[] => {
    const d = calEventDate(e);
    if (!d) return [];
    const du = daysFrom(baseDate, d);
    // Only include events within the next 21 days and not more than 1 day past
    if (du < -1 || du > 21) return [];

    const rawText = [e.title || e.summary || '', e.description || '', e.location || '']
      .filter(Boolean)
      .join(' ');
    const code = extractCourseCode(rawText);

    return [
      {
        source: 'calendar',
        courseCode: code,
        courseName: code ? null : (e.title || e.summary || null),
        eventType: extractEventType(rawText),
        title: e.title || e.summary || 'Calendar event',
        dateStr: d.toISOString().split('T')[0],
        daysUntil: du,
        urgencyWords: extractUrgencyWords(rawText),
        rawText,
        confidence: SOURCE_BASELINE.calendar,
      },
    ];
  });
}

export function ingestCanvasAssignments(assignments: Assignment[], baseDate: Date): ExtractedEvent[] {
  return assignments.flatMap((a): ExtractedEvent[] => {
    if (a.has_submitted_submissions) return [];
    const d = a.due_at ? new Date(a.due_at) : null;
    if (!d || isNaN(d.getTime())) return [];
    const du = daysFrom(baseDate, d);
    if (du < -7 || du > 30) return [];

    const rawText = [a.name, a.course_name, a.description || ''].join(' ');
    const code = extractCourseCode(a.course_name + ' ' + a.name);

    return [
      {
        source: 'canvas_assignment',
        courseCode: code,
        courseName: a.course_name,
        eventType: extractEventType(rawText),
        title: a.name,
        dateStr: d.toISOString().split('T')[0],
        daysUntil: du,
        urgencyWords: extractUrgencyWords(rawText),
        rawText,
        confidence: SOURCE_BASELINE.canvas_assignment,
      },
    ];
  });
}

export function ingestCanvasAnnouncements(announcements: Announcement[], baseDate: Date): ExtractedEvent[] {
  return announcements.flatMap((a): ExtractedEvent[] => {
    const body = cleanHtml(a.message || '', 800);
    const rawText = [a.title, a.course_name, body].join(' ');
    const code = extractCourseCode(a.course_name + ' ' + a.title + ' ' + body);
    const dateResult = extractNaturalDates(rawText, baseDate);
    const eventType = extractEventType(rawText);

    // Only ingest if it mentions something actionable
    if (eventType === 'other' && !dateResult && extractUrgencyWords(rawText).length === 0) {
      return [];
    }

    return [
      {
        source: 'canvas_announcement',
        courseCode: code,
        courseName: a.course_name,
        eventType,
        title: a.title,
        dateStr: dateResult?.dateStr ?? null,
        daysUntil: dateResult?.daysUntil ?? null,
        urgencyWords: extractUrgencyWords(rawText),
        rawText,
        confidence: SOURCE_BASELINE.canvas_announcement,
      },
    ];
  });
}

export function ingestEmails(emails: Email[], baseDate: Date): ExtractedEvent[] {
  return emails.flatMap((e): ExtractedEvent[] => {
    const rawText = [e.subject || '', e.snippet || '', e.from || ''].join(' ');
    const code = extractCourseCode(rawText);
    const eventType = extractEventType(rawText);
    const dateResult = extractNaturalDates(rawText, baseDate);
    const urgency = extractUrgencyWords(rawText);

    // Only ingest if there's something academic/urgent
    if (
      eventType === 'other' &&
      urgency.length === 0 &&
      !/\b(due|deadline|quiz|exam|assignment|submission|reminder)\b/i.test(rawText)
    ) {
      return [];
    }

    return [
      {
        source: 'email',
        courseCode: code,
        courseName: null,
        eventType,
        title: e.subject || '(no subject)',
        dateStr: dateResult?.dateStr ?? null,
        daysUntil: dateResult?.daysUntil ?? null,
        urgencyWords: urgency,
        rawText,
        confidence: SOURCE_BASELINE.email,
      },
    ];
  });
}

// ── Layer 2: Cross-referencing ────────────────────────────────────────────────

/** Normalize a course name/code for fuzzy comparison. */
function normalizeCourseName(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Decide if two ExtractedEvents likely describe the same underlying event. */
function isSameEvent(a: ExtractedEvent, b: ExtractedEvent): boolean {
  // Same event type (allow 'deadline' to match 'assignment')
  const compatibleTypes = (x: EventType, y: EventType) =>
    x === y ||
    (x === 'deadline' && y === 'assignment') ||
    (x === 'assignment' && y === 'deadline');

  if (!compatibleTypes(a.eventType, b.eventType)) return false;

  // Dates within 2 days of each other (or both null)
  if (a.daysUntil !== null && b.daysUntil !== null) {
    if (Math.abs(a.daysUntil - b.daysUntil) > 2) return false;
  }

  // Title similarity: share at least one meaningful word
  const words = (s: string) =>
    s
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3);
  const aw = new Set(words(a.title));
  const bw = words(b.title);
  if (aw.size > 0 && bw.some((w) => aw.has(w))) return true;

  // Same course code
  if (a.courseCode && b.courseCode && a.courseCode === b.courseCode) return true;

  // Fuzzy course name match
  if (a.courseName && b.courseName) {
    const an = normalizeCourseName(a.courseName);
    const bn = normalizeCourseName(b.courseName);
    if (an.includes(bn) || bn.includes(an)) return true;
  }

  return false;
}

/** Group a flat list of ExtractedEvents into clusters that describe the same event. */
function clusterEvents(events: ExtractedEvent[]): ExtractedEvent[][] {
  const clusters: ExtractedEvent[][] = [];

  for (const ev of events) {
    let placed = false;
    for (const cluster of clusters) {
      // Check if this event matches any member of the cluster
      if (cluster.some((c) => isSameEvent(c, ev))) {
        cluster.push(ev);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([ev]);
  }

  return clusters;
}

/** Compute final confidence given the source events in a cluster. */
function computeClusterConfidence(sources: ExtractedEvent[]): number {
  // Take max baseline as starting point
  const base = Math.max(...sources.map((s) => s.confidence));
  const n = sources.length;
  let c = base;
  if (n === 2) c = Math.min(0.95, base * 1.3);
  else if (n >= 3) c = Math.min(0.98, base * 1.5);
  return Math.round(c * 100) / 100;
}

/** Pick the best representative title from a cluster. */
function bestTitle(sources: ExtractedEvent[]): string {
  // Prefer assignment > announcement > calendar > email
  const priority = ['canvas_assignment', 'canvas_announcement', 'calendar', 'email'] as const;
  for (const src of priority) {
    const match = sources.find((s) => s.source === src);
    if (match) return match.title;
  }
  return sources[0].title;
}

/** Pick the best date from a cluster. */
function bestDate(sources: ExtractedEvent[]): { dateStr: string | null; daysUntil: number | null } {
  const priority = ['canvas_assignment', 'calendar', 'canvas_announcement', 'email'] as const;
  for (const src of priority) {
    const match = sources.find((s) => s.source === src && s.dateStr !== null);
    if (match) return { dateStr: match.dateStr, daysUntil: match.daysUntil };
  }
  return { dateStr: null, daysUntil: null };
}

/** Pick the best course code and name. */
function bestCourse(sources: ExtractedEvent[]): { courseCode: string | null; courseName: string | null } {
  const withCode = sources.find((s) => s.courseCode !== null);
  const withName = sources.find((s) => s.courseName !== null);
  return {
    courseCode: withCode?.courseCode ?? null,
    courseName: withName?.courseName ?? null,
  };
}

/** Build per-event gap hints (not the global gaps). */
function buildEventGaps(sources: ExtractedEvent[]): string[] {
  const gaps: string[] = [];
  const srcTypes = new Set(sources.map((s) => s.source));

  if (!srcTypes.has('canvas_assignment')) {
    const hasAnnouncement = srcTypes.has('canvas_announcement');
    const hasEmail = srcTypes.has('email');
    if (hasAnnouncement || hasEmail) {
      gaps.push('Not formally listed on Canvas yet');
    }
  }
  if (!srcTypes.has('canvas_announcement')) {
    gaps.push('No announcement found on Canvas');
  }
  if (!srcTypes.has('calendar')) {
    gaps.push('Not in your calendar');
  }

  return gaps;
}

/** Build action suggestion based on event type and daysUntil. */
function buildActionSuggestion(
  eventType: EventType,
  daysUntil: number | null,
  courseCode: string | null,
  courseName: string | null,
): string | null {
  const label = courseCode || courseName || 'this';
  if (daysUntil === null) return null;

  if (eventType === 'quiz' || eventType === 'exam') {
    if (daysUntil <= 1) return `Schedule urgent review session for ${label} today`;
    if (daysUntil <= 3) return `Schedule ${daysUntil * 1}h study block for ${label} in the next ${daysUntil} days`;
    return `Block 2h study time for ${label} (${daysUntil} days away)`;
  }
  if (eventType === 'assignment' || eventType === 'deadline') {
    if (daysUntil <= 1) return `Complete and submit ${label} assignment today`;
    if (daysUntil <= 3) return `Dedicate time to finish ${label} assignment (due in ${daysUntil}d)`;
    return `Plan progress sessions for ${label} assignment`;
  }
  if (eventType === 'lab') {
    return `Review lab preparation material for ${label}`;
  }
  return null;
}

export function crossReference(allEvents: ExtractedEvent[]): InferredEvent[] {
  const clusters = clusterEvents(allEvents);
  const inferred: InferredEvent[] = [];

  for (const cluster of clusters) {
    const conf = computeClusterConfidence(cluster);
    const { dateStr, daysUntil } = bestDate(cluster);
    const { courseCode, courseName } = bestCourse(cluster);
    const eventType = cluster[0].eventType; // dominant type (first in cluster)
    const title = bestTitle(cluster);
    const gaps = buildEventGaps(cluster);
    const action = buildActionSuggestion(eventType, daysUntil, courseCode, courseName);

    inferred.push({
      eventType,
      courseCode,
      courseName,
      title,
      dateStr,
      daysUntil,
      confidence: conf,
      confidenceLabel: confidenceLabel(conf),
      sources: cluster,
      gaps,
      actionSuggestion: action,
    });
  }

  // Sort by daysUntil ascending (nulls last), then by confidence descending
  return inferred.sort((a, b) => {
    if (a.daysUntil === null && b.daysUntil === null) return b.confidence - a.confidence;
    if (a.daysUntil === null) return 1;
    if (b.daysUntil === null) return -1;
    if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil;
    return b.confidence - a.confidence;
  });
}

// ── Layer 3: Gap detection ────────────────────────────────────────────────────

export function detectGaps(
  inferred: InferredEvent[],
  calEvents: CalEvent[],
  emailEvents: ExtractedEvent[],
  announcementEvents: ExtractedEvent[],
  baseDate: Date,
): Gap[] {
  const gaps: Gap[] = [];

  const calTitles = calEvents.map((e) =>
    ((e.title || e.summary || '') + ' ' + (e.description || '')).toLowerCase()
  );

  // Helper: check if a calendar block exists that looks like study/prep
  const hasStudyBlock = (daysBeforeTarget: number, targetDaysUntil: number): boolean => {
    const windowStart = targetDaysUntil - daysBeforeTarget;
    const windowEnd = targetDaysUntil;
    return calEvents.some((e) => {
      const d = calEventDate(e);
      if (!d) return false;
      const du = daysFrom(baseDate, d);
      if (du < windowStart || du > windowEnd) return false;
      const text = ((e.title || e.summary || '') + ' ' + (e.description || '')).toLowerCase();
      return /\b(study|review|revision|prep|revise|read)\b/.test(text);
    });
  };

  // Gap 1: Quiz/exam in ≤5 days without a study block in the 48h before
  for (const ev of inferred) {
    if (
      (ev.eventType === 'quiz' || ev.eventType === 'exam') &&
      ev.daysUntil !== null &&
      ev.daysUntil >= 0 &&
      ev.daysUntil <= 5 &&
      ev.confidence >= 0.6
    ) {
      if (!hasStudyBlock(2, ev.daysUntil)) {
        const label = ev.courseCode || ev.courseName || 'Unknown course';
        gaps.push({
          severity: ev.daysUntil <= 2 ? 'critical' : 'warning',
          category: 'missing_study_block',
          courseCode: ev.courseCode,
          courseName: ev.courseName,
          description: `[${label}] ${ev.eventType === 'quiz' ? 'Quiz' : 'Exam'} in ${ev.daysUntil}d — no study block scheduled`,
          suggestedAction: `Schedule ${ev.daysUntil <= 1 ? '2' : '3'}h review session within the next ${ev.daysUntil <= 1 ? 'today' : ev.daysUntil - 1 + 'd'}`,
        });
      }
    }
  }

  // Gap 2: Assignments due in <3 days without prep time
  for (const ev of inferred) {
    if (
      (ev.eventType === 'assignment' || ev.eventType === 'deadline') &&
      ev.daysUntil !== null &&
      ev.daysUntil >= 0 &&
      ev.daysUntil < 3
    ) {
      const nameWords = ev.title.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
      const hasCal = calTitles.some((t) => nameWords.some((w) => t.includes(w)));
      if (!hasCal) {
        const label = ev.courseCode || ev.courseName || 'Unknown';
        gaps.push({
          severity: ev.daysUntil === 0 ? 'critical' : 'warning',
          category: 'missing_study_block',
          courseCode: ev.courseCode,
          courseName: ev.courseName,
          description: `[${label}] "${ev.title}" due in ${ev.daysUntil}d — no calendar block found`,
          suggestedAction: 'Schedule focused work session to complete this',
        });
      }
    }
  }

  // Gap 3: Email mentions exam/quiz but no matching Canvas item
  const canvasEventTitles = inferred
    .filter((e) => e.sources.some((s) => s.source === 'canvas_assignment' || s.source === 'canvas_announcement'))
    .map((e) => e.title.toLowerCase());

  for (const emailEv of emailEvents) {
    if (
      (emailEv.eventType === 'quiz' || emailEv.eventType === 'exam' || emailEv.eventType === 'deadline') &&
      emailEv.daysUntil !== null &&
      emailEv.daysUntil >= 0 &&
      emailEv.daysUntil <= 14
    ) {
      const emailWords = emailEv.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
      const matchedCanvas = canvasEventTitles.some((ct) => emailWords.some((w) => ct.includes(w)));
      if (!matchedCanvas) {
        gaps.push({
          severity: 'warning',
          category: 'unconfirmed_exam',
          courseCode: emailEv.courseCode,
          courseName: emailEv.courseName,
          description: `Email mentions "${emailEv.eventType}" — not found in Canvas`,
          suggestedAction: `Check Canvas for assignment or exam: "${emailEv.title}"`,
        });
      }
    }
  }

  // Gap 4: Announcement mentions quiz but no Canvas assignment entry
  for (const ann of announcementEvents) {
    if (ann.eventType === 'quiz' || ann.eventType === 'exam') {
      const hasAssignment = inferred.some(
        (ev) =>
          ev.sources.some((s) => s.source === 'canvas_assignment') &&
          ev.eventType === ann.eventType &&
          (ev.courseCode === ann.courseCode || ev.courseName === ann.courseName)
      );
      if (!hasAssignment) {
        const label = ann.courseCode || ann.courseName || 'Unknown';
        gaps.push({
          severity: 'warning',
          category: 'missing_material',
          courseCode: ann.courseCode,
          courseName: ann.courseName,
          description: `[${label}] Announcement mentions "${ann.eventType}" — no matching Canvas assignment`,
          suggestedAction: `Check Canvas for ${ann.eventType} details`,
        });
      }
    }
  }

  // Deduplicate by description
  const seen = new Set<string>();
  return gaps.filter((g) => {
    if (seen.has(g.description)) return false;
    seen.add(g.description);
    return true;
  });
}

// ── Layer 5: Build raw summary text for Claude ────────────────────────────────

export function buildRawSummary(report: IntelligenceReport): string {
  const lines: string[] = [];
  lines.push(`=== INTELLIGENCE REPORT — ${report.targetDate} ===`);
  lines.push('');

  // Confirmed events
  if (report.confirmedEvents.length > 0) {
    lines.push('🔴 CONFIRMED EVENTS (high confidence):');
    for (const ev of report.confirmedEvents) {
      const label = ev.courseCode ? `[${ev.courseCode}]` : ev.courseName ? `[${ev.courseName}]` : '';
      const dateLabel = ev.dateStr
        ? (() => {
            const d = new Date(ev.dateStr + 'T12:00:00');
            return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
          })()
        : 'Date TBC';
      const srcNames = [...new Set(ev.sources.map((s) => s.source.replace('canvas_', '').replace('_', ' ')))].join(' + ');
      lines.push(`  ${label} ${ev.eventType.charAt(0).toUpperCase() + ev.eventType.slice(1)} — ${ev.title} | ${dateLabel} | Confidence: ${ev.confidenceLabel} | Sources: ${srcNames}`);
      if (ev.gaps.length > 0) {
        lines.push(`    Gaps: ${ev.gaps.join('. ')}`);
      }
      if (ev.actionSuggestion) {
        lines.push(`    Suggested: ${ev.actionSuggestion}`);
      }
    }
    lines.push('');
  } else {
    lines.push('🔴 CONFIRMED EVENTS: None detected.');
    lines.push('');
  }

  // Inferred events
  if (report.inferencedEvents.length > 0) {
    lines.push('🟡 INFERRED EVENTS (medium confidence):');
    for (const ev of report.inferencedEvents) {
      const label = ev.courseCode ? `[${ev.courseCode}]` : ev.courseName ? `[${ev.courseName}]` : '';
      const dateLabel = ev.dateStr
        ? (() => {
            const d = new Date(ev.dateStr + 'T12:00:00');
            return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
          })()
        : 'Date TBC';
      const srcNames = [...new Set(ev.sources.map((s) => s.source.replace('canvas_', '').replace('_', ' ')))].join(' + ');
      lines.push(`  ${label} ${ev.eventType.charAt(0).toUpperCase() + ev.eventType.slice(1)} — ${ev.title} | ${dateLabel} | Confidence: ${ev.confidenceLabel} | Sources: ${srcNames}`);
      if (ev.gaps.length > 0) {
        lines.push(`    Gaps: ${ev.gaps.join('. ')}`);
      }
      if (ev.actionSuggestion) {
        lines.push(`    Suggested: ${ev.actionSuggestion}`);
      }
    }
    lines.push('');
  }

  // Uncertain events
  if (report.uncertainEvents.length > 0) {
    lines.push('⚪ UNCERTAIN EVENTS (low confidence):');
    for (const ev of report.uncertainEvents) {
      const label = ev.courseCode ? `[${ev.courseCode}]` : ev.courseName ? `[${ev.courseName}]` : '';
      lines.push(`  ${label} ${ev.title} | ${ev.confidenceLabel}`);
    }
    lines.push('');
  }

  // Gaps
  if (report.gaps.length > 0) {
    lines.push('🚨 GAPS DETECTED:');
    const criticals = report.gaps.filter((g) => g.severity === 'critical');
    const warnings = report.gaps.filter((g) => g.severity === 'warning');
    const infos = report.gaps.filter((g) => g.severity === 'info');
    for (const g of criticals) lines.push(`  CRITICAL: ${g.description}`);
    for (const g of warnings) lines.push(`  WARNING: ${g.description}`);
    for (const g of infos) lines.push(`  INFO: ${g.description}`);
    lines.push('');
  }

  // Course intelligence map
  const courses = Object.values(report.courseMap);
  if (courses.length > 0) {
    lines.push('📊 COURSE INTELLIGENCE:');
    const sorted = courses.slice().sort((a, b) => b.urgencyScore - a.urgencyScore);
    for (const ci of sorted) {
      const label = ci.courseCode ? `${ci.courseCode}` : ci.courseName;
      lines.push(`  ${label} — urgency: ${ci.urgencyScore}/10`);
      if (ci.recentAnnouncements.length > 0) {
        lines.push(`    Latest announcement: "${ci.recentAnnouncements[0].title}"`);
      }
      if (ci.gaps.length > 0) {
        lines.push(`    Gaps: ${ci.gaps.map((g) => g.description).join(' | ')}`);
      }
    }
    lines.push('');
  }

  // Prioritized alerts
  if (report.prioritizedAlerts.length > 0) {
    lines.push('⚡ PRIORITY ALERTS:');
    report.prioritizedAlerts.forEach((a) => lines.push(`  • ${a}`));
    lines.push('');
  }

  lines.push('=== END INTELLIGENCE REPORT ===');
  return lines.join('\n');
}

// ── Layer 5: Build course map ─────────────────────────────────────────────────

function buildCourseMap(
  inferred: InferredEvent[],
  announcements: ExtractedEvent[],
  emails: ExtractedEvent[],
  gaps: Gap[],
): Record<string, CourseIntelligence> {
  const map: Record<string, CourseIntelligence> = {};

  const getCourseKey = (ev: { courseCode: string | null; courseName: string | null }): string =>
    ev.courseCode || normalizeCourseName(ev.courseName || 'unknown');

  // Seed from inferred events
  for (const ev of inferred) {
    const key = getCourseKey(ev);
    if (!map[key]) {
      map[key] = {
        courseCode: ev.courseCode,
        courseName: ev.courseName || ev.courseCode || 'Unknown',
        upcomingEvents: [],
        recentAnnouncements: [],
        recentEmails: [],
        gaps: [],
        urgencyScore: 0,
      };
    }
    map[key].upcomingEvents.push(ev);
  }

  // Add announcements
  for (const ann of announcements) {
    const key = getCourseKey(ann);
    if (!map[key]) {
      map[key] = {
        courseCode: ann.courseCode,
        courseName: ann.courseName || ann.courseCode || 'Unknown',
        upcomingEvents: [],
        recentAnnouncements: [],
        recentEmails: [],
        gaps: [],
        urgencyScore: 0,
      };
    }
    map[key].recentAnnouncements.push(ann);
  }

  // Add emails
  for (const em of emails) {
    const key = getCourseKey(em);
    if (map[key]) {
      map[key].recentEmails.push(em);
    }
  }

  // Attach gaps
  for (const g of gaps) {
    const key = g.courseCode || normalizeCourseName(g.courseName || 'unknown');
    if (map[key]) {
      map[key].gaps.push(g);
    }
  }

  // Compute urgency scores (0-10)
  for (const ci of Object.values(map)) {
    let score = 0;
    for (const ev of ci.upcomingEvents) {
      if (ev.daysUntil !== null && ev.daysUntil >= 0) {
        const proximity = Math.max(0, 5 - ev.daysUntil); // closer = higher
        const typeMult =
          ev.eventType === 'exam' ? 2 :
          ev.eventType === 'quiz' ? 1.5 :
          ev.eventType === 'assignment' ? 1.2 : 1;
        score += proximity * typeMult * ev.confidence;
      }
    }
    for (const g of ci.gaps) {
      score += g.severity === 'critical' ? 3 : g.severity === 'warning' ? 1.5 : 0.5;
    }
    ci.urgencyScore = Math.min(10, Math.round(score * 10) / 10);
  }

  return map;
}

// ── Main export: runIntelligenceEngine ───────────────────────────────────────

export async function runIntelligenceEngine(
  userId: string,
  targetDate: string,
): Promise<IntelligenceReport> {
  const baseDate = new Date(targetDate + 'T00:00:00');

  // Fetch raw caches
  const [calRes, canvasRes, emailRes] = await Promise.all([
    supabaseAdmin.from('calendar_cache').select('data').eq('user_id', userId).single(),
    supabaseAdmin.from('canvas_cache').select('data').eq('user_id', userId).single(),
    supabaseAdmin.from('email_cache').select('data').eq('user_id', userId).single(),
  ]);

  const calEvents: CalEvent[] = (calRes.data?.data as CalEvent[] | null) || [];
  const canvas = canvasRes.data?.data as {
    assignments?: Assignment[];
    announcements?: Announcement[];
    courses?: { name: string; id: number }[];
  } | null;
  const emails: Email[] = (emailRes.data?.data as Email[] | null) || [];

  const assignments: Assignment[] = canvas?.assignments || [];
  const announcements: Announcement[] = canvas?.announcements || [];

  // Layer 1: Ingest
  const calExtracted = ingestCalendar(calEvents, baseDate);
  const assignmentExtracted = ingestCanvasAssignments(assignments, baseDate);
  const announcementExtracted = ingestCanvasAnnouncements(announcements, baseDate);
  const emailExtracted = ingestEmails(emails, baseDate);

  const allExtracted = [
    ...calExtracted,
    ...assignmentExtracted,
    ...announcementExtracted,
    ...emailExtracted,
  ];

  // Layer 2: Cross-reference
  const inferred = crossReference(allExtracted);

  // Layer 3: Gap detection
  const gaps = detectGaps(inferred, calEvents, emailExtracted, announcementExtracted, baseDate);

  // Layer 4: Split by confidence tier
  const confirmedEvents = inferred.filter((e) => e.confidence >= 0.8);
  const inferencedEvents = inferred.filter((e) => e.confidence >= 0.5 && e.confidence < 0.8);
  const uncertainEvents = inferred.filter((e) => e.confidence < 0.5);

  // Build course intelligence map
  const courseMap = buildCourseMap(inferred, announcementExtracted, emailExtracted, gaps);

  // Build prioritized alerts (top 5)
  const prioritizedAlerts: string[] = [];

  // Critical gaps first
  for (const g of gaps.filter((g) => g.severity === 'critical').slice(0, 3)) {
    prioritizedAlerts.push(g.description);
  }
  // High-confidence events within 3 days
  for (const ev of confirmedEvents.filter((e) => e.daysUntil !== null && e.daysUntil <= 3).slice(0, 3)) {
    const label = ev.courseCode || ev.courseName || '';
    prioritizedAlerts.push(
      `${label ? `[${label}] ` : ''}${ev.eventType} "${ev.title}" in ${ev.daysUntil}d — ${ev.confidenceLabel}`
    );
  }
  // Warning gaps
  for (const g of gaps.filter((g) => g.severity === 'warning').slice(0, 2)) {
    prioritizedAlerts.push(g.description);
  }

  const uniqueAlerts = [...new Set(prioritizedAlerts)].slice(0, 5);

  const report: IntelligenceReport = {
    generatedAt: new Date().toISOString(),
    targetDate,
    confirmedEvents,
    inferencedEvents,
    uncertainEvents,
    gaps,
    courseMap,
    prioritizedAlerts: uniqueAlerts,
    rawSummary: '', // filled below
  };

  // Layer 5: Build summary
  report.rawSummary = buildRawSummary(report);

  return report;
}
