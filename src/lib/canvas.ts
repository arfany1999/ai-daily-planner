import { supabaseAdmin } from './supabase';
import { decrypt } from './encryption';

const CANVAS_BASE = 'https://rmit.instructure.com/api/v1';
const FETCH_TIMEOUT_MS = 10000;
const MAX_PAGES = 10;
const ANNOUNCEMENT_DAYS = 180;
const EVENT_FUTURE_DAYS = 120;
const EVENT_PAST_DAYS = 30;

export class CanvasAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanvasAuthError';
  }
}

export async function getCanvasToken(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('users')
    .select('canvas_token')
    .eq('id', userId)
    .single();

  if (!data?.canvas_token) throw new Error('Canvas token not configured');
  return decrypt(data.canvas_token);
}

async function canvasFetchWithTimeout(url: string, token: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function canvasFetch<T>(path: string, token: string): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = `${CANVAS_BASE}${path}${path.includes('?') ? '&' : '?'}per_page=50`;
  let pages = 0;

  while (url && pages < MAX_PAGES) {
    const res = await canvasFetchWithTimeout(url, token);

    if (res.status === 401 || res.status === 403) {
      throw new CanvasAuthError('Canvas token expired or revoked. Please reconnect Canvas in Settings.');
    }
    if (!res.ok) {
      throw new Error(`Canvas API ${res.status}: ${await res.text().catch(() => 'Unknown error')}`);
    }

    const data = await res.json();
    if (Array.isArray(data)) results.push(...data);
    else results.push(data);

    pages++;
    const linkHeader = res.headers.get('Link') || '';
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }

  return results;
}

async function canvasFetchSingle<T>(path: string, token: string): Promise<T | null> {
  const url = `${CANVAS_BASE}${path}`;
  const res = await canvasFetchWithTimeout(url, token);
  if (res.status === 401 || res.status === 403) {
    throw new CanvasAuthError('Canvas token expired or revoked.');
  }
  if (!res.ok) return null;
  return await res.json();
}

// ── Date extraction from announcement HTML ──────────────────────────────────
// Extract dates like "May 15", "15/5", "15 May 2026", "Mon 15 May", "15-05-2026"
const DATE_PATTERNS: RegExp[] = [
  /\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/g,
  /\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:\s+(\d{2,4}))?\b/gi,
  /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:,?\s+(\d{2,4}))?\b/gi,
];

const DATE_KEYWORDS = /\b(quiz|exam|test|assessment|due|deadline|submit|submission|midterm|mid-?semester|final|practical|prac|lab\s*test)\b/i;

export interface ExtractedDate {
  text: string;          // e.g. "Mid-semester exam"
  date_str: string;      // raw date string from text
  source_id: number;     // announcement id
  course_name: string;
  posted_at: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function extractDatesFromText(
  text: string,
  source_id: number,
  course_name: string,
  posted_at: string
): ExtractedDate[] {
  const out: ExtractedDate[] = [];
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);

  for (const sentence of sentences) {
    if (!DATE_KEYWORDS.test(sentence)) continue;

    for (const pattern of DATE_PATTERNS) {
      pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(sentence)) !== null) {
        const ctx = sentence.trim().slice(0, 200);
        out.push({
          text: ctx,
          date_str: m[0],
          source_id,
          course_name,
          posted_at,
        });
      }
    }
  }
  return out;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CanvasCourse {
  id: number;
  name: string;
  course_code: string;
  workflow_state: string;
  syllabus_body?: string | null;
}

export interface CanvasAssignment {
  id: number;
  name: string;
  course_id: number;
  course_name?: string;
  due_at: string | null;
  description: string;
  html_url: string;
  submission_types: string[];
  has_submitted_submissions: boolean;
  points_possible: number;
}

export interface CanvasAnnouncement {
  id: number;
  title: string;
  message: string;
  posted_at: string;
  context_code: string;
  course_name?: string;
  author: { display_name: string };
}

export interface CanvasQuiz {
  id: number;
  title: string;
  course_id: number;
  course_name?: string;
  due_at: string | null;
  unlock_at: string | null;
  lock_at: string | null;
  time_limit: number | null;
  allowed_attempts: number | null;
  question_count: number;
  points_possible: number;
  quiz_type: string;
  html_url: string;
  published: boolean;
  // Submission tracking
  submitted: boolean;
  attempts_taken: number;
  score: number | null;
}

export interface CanvasEvent {
  id: number | string;
  title: string;
  start_at: string | null;
  end_at: string | null;
  description: string;
  location_name: string | null;
  context_code: string;
  course_name?: string;
  url: string;
  type: string; // 'event' | 'assignment'
}

export interface CanvasModuleItem {
  id: number;
  title: string;
  type: string; // 'Page' | 'File' | 'Quiz' | 'Assignment' | 'ExternalUrl' | etc.
  course_id: number;
  course_name?: string;
  module_name?: string;
  html_url: string;
  external_url?: string | null;
}

export interface CanvasDiscussion {
  id: number;
  title: string;
  message: string;
  posted_at: string;
  course_id: number;
  course_name?: string;
  html_url: string;
  author: { display_name: string };
  pinned: boolean;
}

export interface CanvasData {
  courses: CanvasCourse[];
  assignments: CanvasAssignment[];
  quizzes: CanvasQuiz[];
  announcements: CanvasAnnouncement[];
  discussions: CanvasDiscussion[];
  events: CanvasEvent[];
  module_items: CanvasModuleItem[];
  extracted_dates: ExtractedDate[];
  fetched_at: string;
}

// ── Main fetch ───────────────────────────────────────────────────────────────

export async function fetchAllCanvasData(userId: string): Promise<CanvasData> {
  const token = await getCanvasToken(userId);

  // 1. Active courses with syllabus
  const coursesRaw = await canvasFetch<CanvasCourse>(
    '/courses?enrollment_state=active&include[]=total_scores&include[]=syllabus_body',
    token
  );
  const activeCourses = coursesRaw.filter(
    (c) => c.workflow_state === 'available' || c.workflow_state === 'completed'
  );

  const courseNameById = new Map(activeCourses.map((c) => [c.id, c.name]));

  // 2. Fetch everything in parallel
  const [assignmentResults, quizResults, eventsResult, announcementsResult, discussionResults, moduleItemResults] = await Promise.all([
    Promise.allSettled(
      activeCourses.map((course) =>
        canvasFetch<CanvasAssignment>(
          `/courses/${course.id}/assignments?order_by=due_at&include[]=submission&include[]=all_dates`,
          token
        ).then((as) => as.map((a) => ({ ...a, course_name: course.name })))
      )
    ),

    // Quizzes: fetch list, then submission state per quiz (limited concurrency)
    Promise.allSettled(
      activeCourses.map(async (course) => {
        try {
          const quizzes = await canvasFetch<CanvasQuiz>(
            `/courses/${course.id}/quizzes`,
            token
          );

          // Fetch submission state for ALL quizzes in this course (single endpoint)
          let submissionsMap = new Map<number, { attempt: number | null; score: number | null; finished_at: string | null; workflow_state: string }>();
          try {
            const subsRes = await canvasFetchSingle<{ quiz_submissions: { quiz_id: number; attempt: number | null; score: number | null; finished_at: string | null; workflow_state: string }[] }>(
              `/courses/${course.id}/quizzes/submissions?per_page=100`,
              token
            );
            const subs = subsRes?.quiz_submissions || [];
            submissionsMap = new Map(subs.map((s) => [s.quiz_id, s]));
          } catch { /* skip submission lookup if it fails */ }

          return quizzes.map((q) => {
            const sub = submissionsMap.get(q.id);
            return {
              ...q,
              course_name: course.name,
              course_id: course.id,
              submitted: !!sub && (sub.workflow_state === 'complete' || !!sub.finished_at),
              attempts_taken: sub?.attempt || 0,
              score: sub?.score ?? null,
            };
          });
        } catch {
          return [] as CanvasQuiz[];
        }
      })
    ),

    // Calendar events INCLUDING assignment-type entries
    (async () => {
      const contextCodes = activeCourses.map((c) => `course_${c.id}`).join('&context_codes[]=');
      if (!contextCodes) return [] as CanvasEvent[];
      const past = new Date(); past.setDate(past.getDate() - EVENT_PAST_DAYS);
      const future = new Date(); future.setDate(future.getDate() + EVENT_FUTURE_DAYS);
      const dateRange = `start_date=${past.toISOString()}&end_date=${future.toISOString()}&all_events=true`;
      try {
        // Fetch both event types in parallel
        const [evs, assignmentEvs] = await Promise.all([
          canvasFetch<CanvasEvent>(
            `/calendar_events?context_codes[]=${contextCodes}&type=event&${dateRange}`,
            token
          ).catch(() => [] as CanvasEvent[]),
          canvasFetch<CanvasEvent>(
            `/calendar_events?context_codes[]=${contextCodes}&type=assignment&${dateRange}`,
            token
          ).catch(() => [] as CanvasEvent[]),
        ]);
        return [...evs, ...assignmentEvs];
      } catch {
        return [] as CanvasEvent[];
      }
    })(),

    // Announcements
    (async () => {
      const contextCodes = activeCourses.map((c) => `course_${c.id}`).join('&context_codes[]=');
      if (!contextCodes) return [] as CanvasAnnouncement[];
      const start = new Date(); start.setDate(start.getDate() - ANNOUNCEMENT_DAYS);
      try {
        return await canvasFetch<CanvasAnnouncement>(
          `/announcements?context_codes[]=${contextCodes}&start_date=${start.toISOString()}&latest_only=false`,
          token
        );
      } catch {
        return [] as CanvasAnnouncement[];
      }
    })(),

    // Discussion topics
    Promise.allSettled(
      activeCourses.map(async (course) => {
        try {
          const topics = await canvasFetch<CanvasDiscussion>(
            `/courses/${course.id}/discussion_topics?order_by=recent_activity&per_page=50`,
            token
          );
          return topics.map((t) => ({
            ...t,
            course_id: course.id,
            course_name: course.name,
          }));
        } catch {
          return [] as CanvasDiscussion[];
        }
      })
    ),

    // Module items — only Pages, Quizzes, Assignments, ExternalUrl (skip Files for speed)
    Promise.allSettled(
      activeCourses.map(async (course) => {
        try {
          const modules = await canvasFetch<{ id: number; name: string; items_url?: string }>(
            `/courses/${course.id}/modules?include[]=items&include[]=content_details&per_page=20`,
            token
          );
          const items: CanvasModuleItem[] = [];
          for (const mod of modules) {
            const modItems = await canvasFetch<{ id: number; title: string; type: string; html_url: string; external_url?: string | null }>(
              `/courses/${course.id}/modules/${mod.id}/items?per_page=50`,
              token
            ).catch(() => []);
            for (const it of modItems) {
              if (it.type === 'File') continue; // skip files for perf
              items.push({
                id: it.id,
                title: it.title,
                type: it.type,
                course_id: course.id,
                course_name: course.name,
                module_name: mod.name,
                html_url: it.html_url,
                external_url: it.external_url ?? null,
              });
            }
          }
          return items;
        } catch {
          return [] as CanvasModuleItem[];
        }
      })
    ),
  ]);

  const allAssignments: CanvasAssignment[] = [];
  for (const r of assignmentResults) if (r.status === 'fulfilled') allAssignments.push(...r.value);

  const allQuizzes: CanvasQuiz[] = [];
  for (const r of quizResults) if (r.status === 'fulfilled') allQuizzes.push(...r.value);

  const events: CanvasEvent[] = eventsResult.map((e) => {
    const ctx = e.context_code || '';
    const idMatch = ctx.match(/^course_(\d+)$/);
    const course_name = idMatch ? courseNameById.get(parseInt(idMatch[1], 10)) : '';
    return { ...e, course_name: course_name || '' };
  });

  const allAnnouncements: CanvasAnnouncement[] = announcementsResult.map((a) => ({
    ...a,
    course_name:
      courseNameById.get(parseInt((a.context_code || '').replace('course_', ''), 10)) || '',
  }));

  const allDiscussions: CanvasDiscussion[] = [];
  for (const r of discussionResults) if (r.status === 'fulfilled') allDiscussions.push(...r.value);

  const allModuleItems: CanvasModuleItem[] = [];
  for (const r of moduleItemResults) if (r.status === 'fulfilled') allModuleItems.push(...r.value);

  // Extract dates from announcements
  const extracted_dates: ExtractedDate[] = [];
  for (const a of allAnnouncements) {
    const text = stripHtml(a.title + '\n' + (a.message || ''));
    extracted_dates.push(...extractDatesFromText(text, a.id, a.course_name || '', a.posted_at));
  }

  // Extract dates from discussions
  for (const d of allDiscussions) {
    const text = stripHtml(d.title + '\n' + (d.message || ''));
    extracted_dates.push(...extractDatesFromText(text, d.id, d.course_name || '', d.posted_at));
  }

  // Also extract from syllabi
  for (const c of activeCourses) {
    if (c.syllabus_body) {
      const text = stripHtml(c.syllabus_body);
      extracted_dates.push(
        ...extractDatesFromText(text, c.id, c.name, new Date().toISOString())
      );
    }
  }

  return {
    courses: activeCourses,
    assignments: allAssignments,
    quizzes: allQuizzes,
    announcements: allAnnouncements,
    discussions: allDiscussions,
    events,
    module_items: allModuleItems,
    extracted_dates,
    fetched_at: new Date().toISOString(),
  };
}
