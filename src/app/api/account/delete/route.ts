import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { getUserTokens, logError } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase';

export const POST = withAuth(async (_req, userId) => {
  try {
    // Revoke Google OAuth grant
    const tokens = await getUserTokens(userId);
    if (tokens?.accessToken) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${tokens.accessToken}`, { method: 'POST' });
      } catch {
        // Best effort - continue even if revocation fails
      }
    }

    // Delete connection results first (FK to custom_connections)
    const { data: connIds } = await supabaseAdmin
      .from('custom_connections')
      .select('id')
      .eq('user_id', userId);
    if (connIds && connIds.length > 0) {
      const ids = connIds.map((c) => c.id);
      await supabaseAdmin.from('connection_results').delete().in('connection_id', ids);
    }

    // Delete from all user tables
    const userTables = [
      'user_settings', 'core_connections', 'custom_connections', 'card_prompts',
      'calendar_cache', 'email_cache', 'canvas_cache', 'canvas_state',
      'semester_context', 'materials', 'processed_files', 'briefings',
      'todos', 'task_completions', 'ai_conversations', 'user_preferences',
      'progress_weekly', 'schedule_history', 'usage_tracking', 'error_log',
    ];

    for (const table of userTables) {
      await supabaseAdmin.from(table).delete().eq('user_id', userId);
    }

    // Finally delete the user
    await supabaseAdmin.from('users').delete().eq('id', userId);

    return NextResponse.json({
      success: true,
      message: 'Account and all data permanently deleted. Google access revoked.',
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await logError('account/delete', msg, userId);
    return NextResponse.json({ error: 'Failed to delete account', message: msg }, { status: 500 });
  }
});
