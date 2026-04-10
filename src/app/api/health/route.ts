import { NextResponse } from 'next/server';
import { getUserTokens } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/options';

export async function GET() {
  const checks: Record<string, { status: string; message?: string }> = {};

  // Check Supabase connection
  try {
    const { count, error } = await supabaseAdmin.from('users').select('*', { count: 'exact', head: true });
    if (error) throw error;
    checks.database = { status: 'ok', message: `${count} users` };
  } catch (e) {
    checks.database = { status: 'error', message: e instanceof Error ? e.message : 'Unknown' };
  }

  // Check Google tokens for current user
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.email) {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', session.user.email)
        .single();

      if (user) {
        const tokens = await getUserTokens(user.id);
        checks.google = tokens ? { status: 'ok' } : { status: 'not_configured', message: 'Sign in again to grant access.' };

        // Check Canvas
        const { data: canvasUser } = await supabaseAdmin
          .from('users')
          .select('canvas_connected')
          .eq('id', user.id)
          .single();
        checks.canvas = canvasUser?.canvas_connected ? { status: 'ok' } : { status: 'not_configured', message: 'Canvas not connected' };
      } else {
        checks.google = { status: 'not_configured', message: 'User not found' };
        checks.canvas = { status: 'not_configured' };
      }
    } else {
      checks.google = { status: 'not_configured', message: 'Not signed in' };
      checks.canvas = { status: 'not_configured' };
    }
  } catch (e) {
    checks.google = { status: 'error', message: e instanceof Error ? e.message : 'Unknown' };
  }

  // Check Anthropic API key (server-side, shared)
  checks.anthropic = process.env.ANTHROPIC_API_KEY
    ? { status: 'ok' }
    : { status: 'not_configured', message: 'ANTHROPIC_API_KEY not set' };

  const allOk = Object.values(checks).every((c) => c.status === 'ok');
  return NextResponse.json({ status: allOk ? 'healthy' : 'degraded', checks, timestamp: new Date().toISOString() });
}
