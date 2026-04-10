import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

export const GET = withAuth(async (req: Request) => {
  const id = req.url.split('/connections/')[1]?.split('/')[0];
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { data: rows } = await supabaseAdmin
    .from('connection_results')
    .select('result_text, fetched_at')
    .eq('connection_id', id)
    .order('fetched_at', { ascending: false })
    .limit(7);

  return NextResponse.json({ history: rows || [] });
});
