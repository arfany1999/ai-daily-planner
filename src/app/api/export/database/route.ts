import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { isAdmin } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase';

export const GET = withAuth(async (_req, userId) => {
  // Admin-only endpoint
  if (!await isAdmin(userId)) {
    return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
  }

  // Export all user data as JSON
  const tables = [
    'users', 'user_settings', 'core_connections', 'custom_connections',
    'connection_results', 'card_prompts', 'calendar_cache', 'email_cache',
    'canvas_cache', 'canvas_state', 'semester_context', 'briefings',
    'todos', 'materials', 'processed_files', 'task_completions',
    'schedule_history', 'ai_conversations', 'user_preferences',
    'progress_weekly', 'usage_tracking', 'error_log',
  ];

  const exportData: Record<string, unknown[]> = {};

  for (const table of tables) {
    try {
      const { data } = await supabaseAdmin.from(table).select('*').limit(10000);
      exportData[table] = data || [];
    } catch {
      exportData[table] = [];
    }
  }

  const json = JSON.stringify(exportData, null, 2);

  return new NextResponse(json, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="planner-export-${new Date().toISOString().split('T')[0]}.json"`,
    },
  });
});
