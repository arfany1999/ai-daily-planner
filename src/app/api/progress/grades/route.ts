import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

// Store grades in user_settings.grades (JSONB field)
// Grade item: { id: string; course: string; assessment: string; grade: number; max_grade: number; weight: number }

export const GET = withAuth(async (_req, userId) => {
  const { data } = await supabaseAdmin
    .from('user_settings')
    .select('grades')
    .eq('user_id', userId)
    .single();
  return NextResponse.json({ grades: (data as { grades?: unknown[] } | null)?.grades || [] });
});

export const POST = withAuth(async (req, userId) => {
  const body = await req.json() as { id?: string; course: string; assessment: string; grade: number; max_grade?: number; weight?: number };
  const { data: settings } = await supabaseAdmin
    .from('user_settings')
    .select('grades')
    .eq('user_id', userId)
    .single();
  const grades = ((settings as { grades?: unknown[] } | null)?.grades || []) as { id?: string }[];
  const existing = grades.findIndex((g) => g.id === body.id);
  const entry = {
    id: body.id || crypto.randomUUID(),
    course: body.course,
    assessment: body.assessment,
    grade: body.grade,
    max_grade: body.max_grade ?? 100,
    weight: body.weight ?? 100,
  };
  if (existing >= 0) {
    grades[existing] = entry;
  } else {
    grades.push(entry);
  }
  await supabaseAdmin.from('user_settings').update({ grades }).eq('user_id', userId);
  return NextResponse.json({ grades });
});

export const DELETE = withAuth(async (req, userId) => {
  const { id } = await req.json() as { id: string };
  const { data: settings } = await supabaseAdmin
    .from('user_settings')
    .select('grades')
    .eq('user_id', userId)
    .single();
  const grades = (((settings as { grades?: unknown[] } | null)?.grades || []) as { id?: string }[])
    .filter((g) => g.id !== id);
  await supabaseAdmin.from('user_settings').update({ grades }).eq('user_id', userId);
  return NextResponse.json({ grades });
});
