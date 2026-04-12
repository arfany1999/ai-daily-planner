import { supabaseAdmin } from './supabase';
import { decrypt } from './encryption';

const CANVAS_BASE = 'https://rmit.instructure.com/api/v1';
const FETCH_TIMEOUT_MS = 8000;
const MAX_PAGES = 3; // cap at 150 items per endpoint

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

export interface CanvasData {
  courses: CanvasCourse[];
  assignments: CanvasAssignment[];
  announcements: CanvasAnnouncement[];
  fetched_at: string;
}

export async function fetchAllCanvasData(userId: string): Promise<CanvasData> {
  const token = await getCanvasToken(userId);

  // 1. Fetch active courses
  const courses = await canvasFetch<CanvasCourse>(
    '/courses?enrollment_state=active&include[]=total_scores',
    token
  );
  const activeCourses = courses.filter((c) => c.workflow_state === 'available');

  // 2. Fetch assignments for all courses IN PARALLEL
  const assignmentResults = await Promise.allSettled(
    activeCourses.map((course) =>
      canvasFetch<CanvasAssignment>(
        `/courses/${course.id}/assignments?order_by=due_at&include[]=submission`,
        token
      ).then((assignments) => assignments.map((a) => ({ ...a, course_name: course.name })))
    )
  );

  const allAssignments: CanvasAssignment[] = [];
  for (const result of assignmentResults) {
    if (result.status === 'fulfilled') allAssignments.push(...result.value);
  }

  // 3. Fetch announcements IN PARALLEL with assignments
  const contextCodes = activeCourses.map((c) => `course_${c.id}`).join('&context_codes[]=');
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  let allAnnouncements: CanvasAnnouncement[] = [];
  if (contextCodes) {
    try {
      allAnnouncements = await canvasFetch<CanvasAnnouncement>(
        `/announcements?context_codes[]=${contextCodes}&start_date=${thirtyDaysAgo.toISOString()}&latest_only=false`,
        token
      );
      const courseMap = new Map(activeCourses.map((c) => [`course_${c.id}`, c.name]));
      for (const a of allAnnouncements) {
        a.course_name = courseMap.get(a.context_code) || '';
      }
    } catch {
      // Announcements failing is non-fatal
    }
  }

  return {
    courses: activeCourses,
    assignments: allAssignments,
    announcements: allAnnouncements,
    fetched_at: new Date().toISOString(),
  };
}
