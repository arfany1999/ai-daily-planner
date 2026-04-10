import { supabaseAdmin } from './supabase';
import { decrypt } from './encryption';

const CANVAS_BASE = 'https://rmit.instructure.com/api/v1';

export class CanvasAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanvasAuthError';
  }
}

// Get the Canvas API token for a specific user
export async function getCanvasToken(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('users')
    .select('canvas_token')
    .eq('id', userId)
    .single();

  if (!data?.canvas_token) throw new Error('Canvas token not configured');
  return decrypt(data.canvas_token);
}

// Generic Canvas API fetch with pagination support
async function canvasFetch<T>(path: string, token: string, allPages = true): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = `${CANVAS_BASE}${path}${path.includes('?') ? '&' : '?'}per_page=50`;

  while (url) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401 || res.status === 403) {
      throw new CanvasAuthError('Canvas token expired or revoked. Please reconnect Canvas in Settings.');
    }

    if (!res.ok) {
      throw new Error(`Canvas API ${res.status}: ${await res.text().catch(() => 'Unknown error')}`);
    }

    const data = await res.json();
    if (Array.isArray(data)) {
      results.push(...data);
    } else {
      results.push(data);
    }

    if (!allPages) break;

    // Parse Link header for pagination
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

export interface CanvasModuleItem {
  id: number;
  title: string;
  type: string;
  content_id?: number;
  url?: string;
  external_url?: string;
  html_url?: string;
  module_id: number;
}

export interface CanvasFile {
  id: number;
  display_name: string;
  filename: string;
  url: string;
  content_type: string;
  size: number;
  created_at: string;
  updated_at: string;
}

export interface CanvasData {
  courses: CanvasCourse[];
  assignments: CanvasAssignment[];
  announcements: CanvasAnnouncement[];
  module_items: { course_id: number; course_name: string; items: CanvasModuleItem[] }[];
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

  // 2. Fetch assignments for each course
  const allAssignments: CanvasAssignment[] = [];
  for (const course of activeCourses) {
    try {
      const assignments = await canvasFetch<CanvasAssignment>(
        `/courses/${course.id}/assignments?order_by=due_at&include[]=submission`,
        token
      );
      for (const a of assignments) {
        a.course_name = course.name;
      }
      allAssignments.push(...assignments);
    } catch {
      // Skip courses where we can't fetch assignments
    }
  }

  // 3. Fetch announcements (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startDate = thirtyDaysAgo.toISOString();

  const contextCodes = activeCourses.map((c) => `course_${c.id}`).join('&context_codes[]=');
  let allAnnouncements: CanvasAnnouncement[] = [];
  if (contextCodes) {
    try {
      allAnnouncements = await canvasFetch<CanvasAnnouncement>(
        `/announcements?context_codes[]=${contextCodes}&start_date=${startDate}&latest_only=false`,
        token
      );
      // Add course names
      const courseMap = new Map(activeCourses.map((c) => [`course_${c.id}`, c.name]));
      for (const a of allAnnouncements) {
        a.course_name = courseMap.get(a.context_code) || '';
      }
    } catch {
      // Announcements may fail if no courses
    }
  }

  // 4. Fetch module items per course
  const allModuleItems: { course_id: number; course_name: string; items: CanvasModuleItem[] }[] = [];
  for (const course of activeCourses) {
    try {
      const modules = await canvasFetch<{ id: number; name: string }>(
        `/courses/${course.id}/modules?include[]=items`,
        token
      );
      const items: CanvasModuleItem[] = [];
      for (const mod of modules) {
        try {
          const modItems = await canvasFetch<CanvasModuleItem>(
            `/courses/${course.id}/modules/${mod.id}/items`,
            token
          );
          items.push(...modItems);
        } catch {
          // Skip modules we can't access
        }
      }
      allModuleItems.push({ course_id: course.id, course_name: course.name, items });
    } catch {
      // Skip courses where we can't access modules
    }
  }

  return {
    courses: activeCourses,
    assignments: allAssignments,
    announcements: allAnnouncements,
    module_items: allModuleItems,
    fetched_at: new Date().toISOString(),
  };
}
