import webpush from 'web-push';
import { supabaseAdmin } from './supabase';

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error('VAPID keys not configured');
  }
  webpush.setVapidDetails('mailto:arfany1999@gmail.com', publicKey, privateKey);
  vapidConfigured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

// Send push notification to a specific user (all their subscriptions)
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  ensureVapid();

  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('subscription')
    .eq('user_id', userId);

  if (!subs || subs.length === 0) {
    throw new Error('No push subscriptions found');
  }

  let sent = 0;
  for (const row of subs) {
    try {
      await webpush.sendNotification(
        row.subscription as webpush.PushSubscription,
        JSON.stringify(payload)
      );
      sent++;
    } catch (err) {
      // Remove expired/invalid subscriptions (410 Gone or 404)
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 410 || statusCode === 404) {
        await supabaseAdmin
          .from('push_subscriptions')
          .delete()
          .eq('user_id', userId)
          .eq('subscription', row.subscription);
      }
    }
  }

  return sent;
}

// Send push to ALL users
export async function broadcastPush(payload: PushPayload): Promise<number> {
  ensureVapid();

  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('user_id, subscription');

  if (!subs) return 0;

  let sent = 0;
  for (const row of subs) {
    try {
      await webpush.sendNotification(
        row.subscription as webpush.PushSubscription,
        JSON.stringify(payload)
      );
      sent++;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 410 || statusCode === 404) {
        await supabaseAdmin
          .from('push_subscriptions')
          .delete()
          .eq('user_id', row.user_id)
          .eq('subscription', row.subscription);
      }
    }
  }

  return sent;
}
