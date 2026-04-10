import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';
import { logError } from '@/lib/db';
import { fetchAllCanvasData, CanvasAuthError } from '@/lib/canvas';

export const GET = withAuth(async (_req, userId) => {
  try {
    const data = await fetchAllCanvasData(userId);

    // Handle empty courses gracefully
    if (!data.courses || data.courses.length === 0) {
      return NextResponse.json({
        data,
        stale: false,
        warning: 'No active courses found. Your Canvas data will appear once your semester starts.',
      });
    }

    await supabaseAdmin.from('canvas_cache').upsert({
      user_id: userId,
      data,
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    return NextResponse.json({ data, stale: false });
  } catch (error) {
    // Auto-disconnect on auth failure
    if (error instanceof CanvasAuthError) {
      await supabaseAdmin.from('users').update({ canvas_connected: false }).eq('id', userId);
      await logError('api/canvas', 'Canvas token expired \u2014 auto-disconnected', userId);
      return NextResponse.json({
        error: 'Canvas token expired or revoked',
        disconnected: true,
        message: 'Your Canvas connection has been disabled. Please reconnect in Settings with a new token.',
      }, { status: 401 });
    }

    const msg = error instanceof Error ? error.message : 'Unknown';
    await logError('api/canvas', msg, userId);

    const { data: cached } = await supabaseAdmin
      .from('canvas_cache')
      .select('data')
      .eq('user_id', userId)
      .single();
    if (cached) return NextResponse.json({ data: cached.data, stale: true });
    return NextResponse.json({ error: 'Failed to fetch Canvas data', message: msg }, { status: 500 });
  }
});

export const revalidate = 10800;
