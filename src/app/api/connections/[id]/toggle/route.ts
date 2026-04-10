import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

export const POST = withAuth(async (req: Request, userId) => {
  const id = req.url.split('/connections/')[1]?.split('/')[0];
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { data: row } = await supabaseAdmin
    .from('custom_connections')
    .select('enabled')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!row) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });

  const newState = !row.enabled;
  await supabaseAdmin.from('custom_connections').update({ enabled: newState }).eq('id', id).eq('user_id', userId);

  return NextResponse.json({ enabled: newState });
});
