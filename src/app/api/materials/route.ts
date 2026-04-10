import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

export const GET = withAuth(async (_req, userId) => {
  const { data: rows } = await supabaseAdmin
    .from('materials')
    .select('id, course, week, source_file, source_type, content, created_at')
    .eq('user_id', userId)
    .order('course')
    .order('week')
    .order('created_at', { ascending: false });

  // Group by course, then by week
  const grouped: Record<string, { course: string; weeks: Record<number, { week: number; materials: { id: string; source_file: string; content: unknown; created_at: string }[] }> }> = {};

  for (const row of rows || []) {
    if (!grouped[row.course]) {
      grouped[row.course] = { course: row.course, weeks: {} };
    }
    if (!grouped[row.course].weeks[row.week]) {
      grouped[row.course].weeks[row.week] = { week: row.week, materials: [] };
    }

    grouped[row.course].weeks[row.week].materials.push({
      id: row.id,
      source_file: row.source_file,
      content: row.content,
      created_at: row.created_at,
    });
  }

  // Convert to sorted array
  const result = Object.values(grouped).map((g) => ({
    course: g.course,
    weeks: Object.values(g.weeks).sort((a, b) => a.week - b.week),
  })).sort((a, b) => a.course.localeCompare(b.course));

  return NextResponse.json({ materials: result, total: (rows || []).length });
});
