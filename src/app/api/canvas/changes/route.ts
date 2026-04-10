import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';
import { logError } from '@/lib/db';
import type { CanvasData, CanvasAssignment, CanvasAnnouncement } from '@/lib/canvas';

interface Changes {
  new_announcements: CanvasAnnouncement[];
  new_files: { course_name: string; title: string; type: string; url?: string }[];
  new_assignments: CanvasAssignment[];
  changed_assignments: { assignment: CanvasAssignment; change: string }[];
  new_youtube_links: { course_name: string; title: string; url: string }[];
}

export const GET = withAuth(async (_req, userId) => {
  try {
    const { data: currentRow } = await supabaseAdmin
      .from('canvas_cache')
      .select('data')
      .eq('user_id', userId)
      .single();
    if (!currentRow) return NextResponse.json({ error: 'No Canvas data cached.' }, { status: 404 });
    const current: CanvasData = currentRow.data as CanvasData;

    const { data: prevRow } = await supabaseAdmin
      .from('canvas_state')
      .select('snapshot')
      .eq('user_id', userId)
      .single();
    const previous: CanvasData | null = prevRow ? prevRow.snapshot as CanvasData : null;

    const changes: Changes = { new_announcements: [], new_files: [], new_assignments: [], changed_assignments: [], new_youtube_links: [] };

    if (previous) {
      const prevAnnouncementIds = new Set(previous.announcements.map((a) => a.id));
      changes.new_announcements = current.announcements.filter((a) => !prevAnnouncementIds.has(a.id));
      const prevAssignmentIds = new Set(previous.assignments.map((a) => a.id));
      changes.new_assignments = current.assignments.filter((a) => !prevAssignmentIds.has(a.id));
      const prevAssignmentMap = new Map(previous.assignments.map((a) => [a.id, a]));
      for (const curr of current.assignments) {
        const prev = prevAssignmentMap.get(curr.id);
        if (prev && prev.due_at !== curr.due_at) changes.changed_assignments.push({ assignment: curr, change: `Due date changed from ${prev.due_at || 'none'} to ${curr.due_at || 'none'}` });
      }
      const prevItemIds = new Set<number>();
      for (const mod of previous.module_items) for (const item of mod.items) prevItemIds.add(item.id);
      for (const mod of current.module_items) for (const item of mod.items) {
        if (!prevItemIds.has(item.id)) {
          if (item.type === 'File') changes.new_files.push({ course_name: mod.course_name, title: item.title, type: 'file', url: item.html_url || undefined });
          if (item.type === 'ExternalUrl' && item.external_url?.includes('youtube')) changes.new_youtube_links.push({ course_name: mod.course_name, title: item.title, url: item.external_url });
          if (item.type === 'Page') changes.new_files.push({ course_name: mod.course_name, title: item.title, type: 'page', url: item.html_url || undefined });
        }
      }
    } else {
      const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      changes.new_announcements = current.announcements.filter((a) => new Date(a.posted_at) > sevenDaysAgo);
    }

    await supabaseAdmin.from('canvas_state').upsert({
      user_id: userId,
      snapshot: current,
    }, { onConflict: 'user_id' });

    return NextResponse.json({ changes, stale: false });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    await logError('api/canvas/changes', msg, userId);
    return NextResponse.json({ error: 'Failed', message: msg }, { status: 500 });
  }
});
