import { supabaseAdmin } from './supabase';
import { decrypt } from './encryption';

const CANVAS_BASE = 'https://rmit.instructure.com/api/v1';
const FETCH_TIMEOUT_MS = 10000;
const MAX_PAGES = 10; // 500 items per endpoint — captures full assignment history
const ANNOUNCEMENT_DAYS = 90; // was 30
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
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    return res;
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

export interface CanvasCourse {
  id: number;
  name: string;
  course_code: string;
  workflow_state: string;
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
}

export interface CanvasEvent {
  id: number;
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

export interface CanvasData {
  courses: CanvasCourse[];
  assignments: CanvasAssignment[];
  quizzes: CanvasQuiz[];
  announcements: CanvasAnnouncement[];
  events: CanvasEvent[];
  fetched_at: string;
}

export async function fetchAllCanvasData(userId: string): Promise<CanvasData> {
  const token = await getCanvasToken(userId);

  // 1. Fetch active courses — include all available states to catch late-starting courses
  const courses = await canvasFetch<CanvasCourse>(
    '/courses?enrollment_state=active&include[]=total_scores',
    token
  );
  // Keep 'available' and 'completed' (e.g. end-of-semester view)
  const activeCourses = courses.filter((c) => c.workflow_state === 'available' || c.workflow_state === 'completed');

  const courseNameById = new Map(activeCourses.map(c => [c.id, c.name]));

  // 2-5. Fetch assignments, quizzes, events, announcements in parallel
  const [assignmentResults, quizResults, eventsResult, announcementsResult] = await Promise.all([
    // Assignments: all (submitted + unsubmitted + undated + past)
    Promise.allSettled(activeCourses.map((course) =>
      canvasFetch<CanvasAssignment>(
        `/courses/${course.id}/assignments?order_by=due_at&include[]=submission&include[]=all_dates`,
        token
      ).then((as) => as.map((a) => ({ ...a, course_name: course.name })))
    )),
    // Quizzes
    Promise.allSettled(activeCourses.map((course) =>
      canvasFetch<CanvasQuiz>(
        `/courses/${course.id}/quizzes`,
        token
      ).then((qs) => qs.map((q) => ({ ...q, course_name: course.name, course_id: course.id })))
        .catch(() => [] as CanvasQuiz[])
    )),
    // Calendar events across all courses (past + future window)
    (async () => {
      const contextCodes = activeCourses.map((c) => `course_${c.id}`).join('&context_codes[]=');
      if (!contextCodes) return [] as CanvasEvent[];
      const past = new Date(); past.setDate(past.getDate() - EVENT_PAST_DAYS);
      const future = new Date(); future.setDate(future.getDate() + EVENT_FUTURE_DAYS);
      try {
        return await canvasFetch<CanvasEvent>(
          `/calendar_events?context_codes[]=${contextCodes}&type=event&start_date=${past.toISOString()}&end_date=${future.toISOString()}&all_events=true`,
          token
        );
      } catch { return [] as CanvasEvent[]; }
    })(),
    // Announcements — 90-day window, every course, not-just-latest
    (async () => {
      const contextCodes = activeCourses.map((c) => `course_${c.id}`).join('&context_codes[]=');
      if (!contextCodes) return [] as CanvasAnnouncement[];
      const start = new Date(); start.setDate(start.getDate() - ANNOUNCEMENT_DAYS);
      try {
        return await canvasFetch<CanvasAnnouncement>(
          `/announcements?context_codes[]=${contextCodes}&start_date=${start.toISOString()}&latest_only=false`,
          token
        );
      } catch { return [] as CanvasAnnouncement[]; }
    })(),
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
    course_name: courseNameById.get(
      parseInt((a.context_code || '').replace('course_', ''), 10)
    ) || '',
  }));

  return {
    courses: activeCourses,
    assignments: allAssignments,
    quizzes: allQuizzes,
    announcements: allAnnouncements,
    events,
    fetched_at: new Date().toISOString(),
  };
}
