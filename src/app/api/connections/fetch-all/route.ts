import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchConnection } from '@/lib/connections';

export const POST = withAuth(async (_req, userId) => {
  const { data: connections } = await supabaseAdmin
    .from('custom_connections')
    .select('id, name')
    .eq('user_id', userId)
    .eq('enabled', true);

  const results: { name: string; status: string; error?: string }[] = [];

  for (const conn of connections || []) {
    const { error } = await fetchConnection(conn.id);
    results.push({
      name: conn.name,
      status: error ? 'error' : 'success',
      error: error || undefined,
    });
  }

  return NextResponse.json({
    fetched: results.filter((r) => r.status === 'success').length,
    total: (connections || []).length,
    results,
  });
});
