import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

// PATCH /api/focus/[id] — update session (complete or stop early)
export const PATCH = withAuth(async (req, userId) => {
  const id = req.url.split('/focus/')[1]?.split('?')[0];
  if (!id) return NextResponse.json({ error: 'Missing session id' }, { status: 400 });

  const body = await req.json();
  const update: Record<string, unknown> = {};

  if (body.completed !== undefined) update.completed = body.completed;
  if (body.actual_minutes !== undefined) update.actual_minutes = body.actual_minutes;
  if (body.completed) update.completed_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('focus_sessions')
    .update(update)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
});
