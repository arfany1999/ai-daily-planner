import { NextResponse } from 'next/server';
import { logError } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Client-side error sink. Called from the global/route error boundaries.
 * Intentionally unauthenticated (errors can happen before auth resolves),
 * but heavily rate-limited by IP so it can't be used to spam the error log.
 */
export async function POST(req: Request) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
  const rl = rateLimit(`client-error:${ip}`, 30, 60_000);
  if (!rl.allowed) return NextResponse.json({ ok: false }, { status: 429 });

  try {
    const body = await req.json() as { message?: string; digest?: string; stack?: string; href?: string };
    const msg = [
      body.message?.slice(0, 500),
      body.digest ? `digest=${body.digest}` : '',
      body.href ? `at ${body.href}` : '',
      body.stack ? '\n' + body.stack.split('\n').slice(0, 8).join('\n') : '',
    ].filter(Boolean).join(' ');
    await logError('client', msg);
  } catch { /* swallow — this endpoint must not fail */ }

  return NextResponse.json({ ok: true });
}
