import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

interface Habit {
  id: string;
  name: string;
  emoji: string;
  color: string;
  target_days: number[]; // 0=Sun ... 6=Sat, empty = every day
}

export const GET = withAuth(async (_req, userId) => {
  const { data } = await supabaseAdmin
    .from('user_settings')
    .select('habits')
    .eq('user_id', userId)
    .single();
  return NextResponse.json({ habits: (data?.habits as Habit[]) || [] });
});

export const POST = withAuth(async (req, userId) => {
  const body = await req.json() as Partial<Habit>;
  if (!body.name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  const newHabit: Habit = {
    id: crypto.randomUUID(),
    name: body.name,
    emoji: body.emoji || '✅',
    color: body.color || '#4a6ef5',
    target_days: body.target_days || [],
  };

  const { data: existing } = await supabaseAdmin
    .from('user_settings')
    .select('habits')
    .eq('user_id', userId)
    .single();

  const habits = [...((existing?.habits as Habit[]) || []), newHabit];

  await supabaseAdmin
    .from('user_settings')
    .upsert({ user_id: userId, habits }, { onConflict: 'user_id' });

  return NextResponse.json({ habit: newHabit, habits });
});

export const DELETE = withAuth(async (req, userId) => {
  const { id } = await req.json() as { id: string };

  const { data: existing } = await supabaseAdmin
    .from('user_settings')
    .select('habits')
    .eq('user_id', userId)
    .single();

  const habits = ((existing?.habits as Habit[]) || []).filter(h => h.id !== id);

  await supabaseAdmin
    .from('user_settings')
    .upsert({ user_id: userId, habits }, { onConflict: 'user_id' });

  return NextResponse.json({ habits });
});
