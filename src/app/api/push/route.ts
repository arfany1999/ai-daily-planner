import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

// GET: return VAPID public key for client-side subscription
export const GET = withAuth(async () => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json({ error: 'Push not configured' }, { status: 503 });
  }
  return NextResponse.json({ publicKey });
});

// POST: save push subscription
export const POST = withAuth(async (req, userId) => {
  const { subscription } = await req.json();
  if (!subscription?.endpoint) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  }

  // Upsert by endpoint to avoid duplicates
  await supabaseAdmin.from('push_subscriptions').upsert({
    user_id: userId,
    subscription,
    endpoint: subscription.endpoint,
    created_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });

  return NextResponse.json({ ok: true });
});

// DELETE: remove push subscription
export const DELETE = withAuth(async (req, userId) => {
  const { endpoint } = await req.json();
  if (!endpoint) {
    return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
  }

  await supabaseAdmin
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', endpoint);

  return NextResponse.json({ ok: true });
});
