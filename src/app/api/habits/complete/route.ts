import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

export const POST = withAuth(async (req, userId) => {
  const { habit_id, date, completed } = await req.json() as { habit_id: string; date: string; completed: boolean };
  if (!habit_id || !date) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const { data: existing } = await supabaseAdmin
    .from('user_settings')
    .select('habit_completions')
    .eq('user_id', userId)
    .single();

  const completions = (existing?.habit_completions as Record<string, Record<string, boolean>>) || {};
  if (!completions[date]) completions[date] = {};
  if (completed) {
    completions[date][habit_id] = true;
  } else {
    delete completions[date][habit_id];
  }

  await supabaseAdmin
    .from('user_settings')
    .upsert({ user_id: userId, habit_completions: completions }, { onConflict: 'user_id' });

  return NextResponse.json({ success: true, completions: completions[date] || {} });
});

export const GET = withAuth(async (req, userId) => {
  const url = new URL(req.url);
  const date = url.searchParams.get('date') || new Date().toLocaleDateString('en-CA');

  const { data } = await supabaseAdmin
    .from('user_settings')
    .select('habit_completions')
    .eq('user_id', userId)
    .single();

  const completions = (data?.habit_completions as Record<string, Record<string, boolean>>) || {};
  return NextResponse.json({ completions: completions[date] || {} });
});
