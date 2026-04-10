import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';
import { encrypt } from '@/lib/encryption';

export const PUT = withAuth(async (req: Request, userId) => {
  const id = req.url.split('/connections/')[1]?.split('/')[0];
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // Verify ownership
  const { data: conn } = await supabaseAdmin
    .from('custom_connections')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .single();
  if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });

  const body = await req.json();

  const updates: Record<string, unknown> = {};
  for (const field of ['name', 'url', 'color', 'icon', 'prompt', 'frequency', 'header_name'] as const) {
    if (body[field] !== undefined) updates[field] = body[field];
  }
  if (body.api_key !== undefined) {
    updates.api_key_encrypted = body.api_key ? encrypt(body.api_key) : null;
  }
  if (body.in_email !== undefined) updates.in_email = body.in_email;
  if (body.enabled !== undefined) updates.enabled = body.enabled;

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

  await supabaseAdmin.from('custom_connections').update(updates).eq('id', id).eq('user_id', userId);

  return NextResponse.json({ success: true });
});

export const DELETE = withAuth(async (req: Request, userId) => {
  const id = req.url.split('/connections/')[1]?.split('/')[0];
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // Verify ownership
  const { data: conn } = await supabaseAdmin
    .from('custom_connections')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .single();
  if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });

  // Delete results first, then connection
  await supabaseAdmin.from('connection_results').delete().eq('connection_id', id);
  await supabaseAdmin.from('custom_connections').delete().eq('id', id).eq('user_id', userId);

  return NextResponse.json({ success: true });
});
