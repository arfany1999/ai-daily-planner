import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';
import { encrypt } from '@/lib/encryption';
import { validateUrl } from '@/lib/connections';

export const GET = withAuth(async (_req, userId) => {
  const { data: connections } = await supabaseAdmin
    .from('custom_connections')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const masked = (connections || []).map((c) => ({
    ...c,
    api_key_encrypted: c.api_key_encrypted ? '••••••' : null,
  }));

  return NextResponse.json(masked);
});

export const POST = withAuth(async (req: Request, userId) => {
  const body = await req.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }
  if (!body.url?.trim()) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  // Validate URL
  const urlCheck = validateUrl(body.url);
  if (!urlCheck.valid) {
    return NextResponse.json({ error: urlCheck.error }, { status: 400 });
  }

  // For API key type, validate the key works
  if (body.type === 'api_key' && body.api_key) {
    try {
      const headers: Record<string, string> = {
        [body.header_name || 'Authorization']: body.api_key.startsWith('Bearer ') ? body.api_key : `Bearer ${body.api_key}`,
      };
      const testRes = await fetch(body.url, { headers, signal: AbortSignal.timeout(10000) });
      if (!testRes.ok) {
        return NextResponse.json({ error: `API key validation failed: HTTP ${testRes.status}` }, { status: 400 });
      }
    } catch (e) {
      return NextResponse.json({ error: `Cannot reach API: ${e instanceof Error ? e.message : 'Unknown'}` }, { status: 400 });
    }
  }

  // For public/RSS, validate URL is reachable
  if (['public', 'rss'].includes(body.type)) {
    try {
      const testRes = await fetch(body.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIPlannerBot/1.0)' },
        signal: AbortSignal.timeout(10000),
      });
      if (!testRes.ok) {
        return NextResponse.json({ error: `URL returned HTTP ${testRes.status}` }, { status: 400 });
      }
    } catch (e) {
      return NextResponse.json({ error: `Cannot reach URL: ${e instanceof Error ? e.message : 'Unknown'}` }, { status: 400 });
    }
  }

  const encryptedKey = body.api_key ? encrypt(body.api_key) : null;

  const { data, error } = await supabaseAdmin
    .from('custom_connections')
    .insert({
      user_id: userId,
      type: body.type,
      name: body.name,
      url: body.url,
      api_key_encrypted: encryptedKey,
      color: body.color || '#0d9b8a',
      icon: body.icon || '\u{1F310}',
      prompt: body.prompt || null,
      frequency: body.frequency || 'daily',
      in_email: body.in_email ?? false,
      enabled: true,
      header_name: body.header_name || 'Authorization',
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
});
