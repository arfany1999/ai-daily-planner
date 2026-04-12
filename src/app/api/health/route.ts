import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/options';
import { decrypt } from '@/lib/encryption';

export async function GET() {
  const checks: Record<string, { status: string; message?: string }> = {};

  const session = await getServerSession(authOptions);
  const userId = (session as unknown as Record<string, unknown>)?.userId as string | undefined;

  // Run DB check + user data fetch in parallel
  const [dbResult, userResult] = await Promise.allSettled([
    supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),
    userId
      ? supabaseAdmin
          .from('users')
          .select('google_access_token, google_refresh_token, canvas_connected')
          .eq('id', userId)
          .single()
      : Promise.resolve(null),
  ]);

  // Database check
  if (dbResult.status === 'fulfilled' && !dbResult.value.error) {
    checks.database = { status: 'ok', message: `${dbResult.value.count} users` };
  } else {
    const err = dbResult.status === 'rejected' ? dbResult.reason : dbResult.value.error;
    checks.database = { status: 'error', message: err?.message || 'Unknown' };
  }

  // Google + Canvas checks from single user row
  if (!userId || !session?.user?.email) {
    checks.google = { status: 'not_configured', message: 'Not signed in' };
    checks.canvas = { status: 'not_configured' };
  } else if (userResult.status === 'fulfilled' && userResult.value) {
    const userData = (userResult.value as { data?: Record<string, unknown> | null }).data;
    if (userData?.google_access_token) {
      try {
        decrypt(userData.google_access_token as string);
        checks.google = { status: 'ok' };
      } catch {
        checks.google = { status: 'not_configured', message: 'Sign in again to grant access.' };
      }
    } else {
      checks.google = { status: 'not_configured', message: 'Sign in again to grant access.' };
    }
    checks.canvas = userData?.canvas_connected
      ? { status: 'ok' }
      : { status: 'not_configured', message: 'Canvas not connected' };
  } else {
    checks.google = { status: 'not_configured', message: 'User not found' };
    checks.canvas = { status: 'not_configured' };
  }

  // Anthropic key (synchronous)
  checks.anthropic = process.env.ANTHROPIC_API_KEY
    ? { status: 'ok' }
    : { status: 'not_configured', message: 'ANTHROPIC_API_KEY not set' };

  const allOk = Object.values(checks).every((c) => c.status === 'ok');
  return NextResponse.json({ status: allOk ? 'healthy' : 'degraded', checks, timestamp: new Date().toISOString() });
}
