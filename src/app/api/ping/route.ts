/**
 * /api/ping — public liveness probe for uptime monitors (UptimeRobot, Better Uptime, etc.).
 * Deliberately minimal: no auth, no DB, no leaking state. Just proves the edge is alive.
 *
 * Middleware allow-list this path in proxy.ts. For full diagnostics (DB, Google, Canvas,
 * Anthropic), use /api/health — that one is auth-gated.
 */
import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { status: 'ok', ts: Date.now() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function HEAD() {
  return new NextResponse(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
