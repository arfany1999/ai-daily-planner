import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

const DEFAULT_PROMPTS: Record<string, string> = {
  weekly: "Generate a rolling 7-day briefing with day-by-day breakdown, deadlines, email highlights woven in, and priority actions.",
  tomorrow: "Create tomorrow\u2019s to-do. Estimate each task + 30 min buffer. Respect work/gym schedule. Carry forward incomplete tasks.",
  materials: "Generate study materials for a 2nd-year pharmacy student: key concepts, detailed notes, pharmacy connections, 10 MCQs, 10 flashcards, exam traps.",
  canvas: "Interpret Canvas announcements. Cancelled class = freed time + suggestion. Deadline change = recalculate. Exam change = flag prominently.",
  calendar: "Suggest study sessions in free slots. 30min-2hr, max 3/day, prefer AM/PM, next 3 days only. Never over work/gym. Title: [AI].",
};

export const GET = withAuth(async (_req, userId) => {
  const { data: rows } = await supabaseAdmin
    .from('card_prompts')
    .select('card_key, prompt_text')
    .eq('user_id', userId);

  const prompts: Record<string, string> = { ...DEFAULT_PROMPTS };
  for (const row of rows || []) prompts[row.card_key] = row.prompt_text;
  return NextResponse.json(prompts);
});

export const PUT = withAuth(async (req, userId) => {
  const body = await req.json();
  if (!body.card_key || !body.prompt_text) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  await supabaseAdmin.from('card_prompts').upsert({
    user_id: userId,
    card_key: body.card_key,
    prompt_text: body.prompt_text,
  }, { onConflict: 'user_id,card_key' });

  return NextResponse.json({ success: true });
});
