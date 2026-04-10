import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

export const GET = withAuth(async (_req, userId) => {
  // Last 30 days of conversations
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString();

  const { data: rows } = await supabaseAdmin
    .from('ai_conversations')
    .select('id, page_context, messages, created_at')
    .eq('user_id', userId)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(100);

  // Group by date
  const grouped: Record<string, { id: string; page_context: string; preview: string; created_at: string }[]> = {};

  for (const row of rows || []) {
    const date = row.created_at.split('T')[0];
    if (!grouped[date]) grouped[date] = [];

    let preview = '';
    try {
      const messages = row.messages as { role: string; content: string }[];
      const firstUser = messages.find((m) => m.role === 'user');
      preview = firstUser?.content?.slice(0, 80) || '';
    } catch {
      preview = '';
    }

    grouped[date].push({
      id: row.id,
      page_context: row.page_context,
      preview,
      created_at: row.created_at,
    });
  }

  return NextResponse.json({ conversations: grouped, total: (rows || []).length });
});
