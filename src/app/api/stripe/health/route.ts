import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { withAuth } from '@/lib/api-handler';
import { getUserSubscription } from '@/lib/subscription';

export const dynamic = 'force-dynamic';

/**
 * /api/stripe/health — quick diagnostic. Reports whether all required
 * Stripe env vars are present and whether the price ID resolves.
 * Auth-gated so only signed-in users see their own subscription state.
 */
export const GET = withAuth(async (_req, userId) => {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() || '';
  const mode = secretKey.startsWith('sk_live_') ? 'live'
    : secretKey.startsWith('sk_test_') ? 'test'
    : 'unknown';

  const env = {
    has_secret_key: Boolean(secretKey),
    stripe_mode: mode,                            // 'live' | 'test' | 'unknown'
    live_mode: mode === 'live',                   // launch check — must be true before real users
    has_price_id: Boolean(process.env.STRIPE_PRICE_ID?.trim()),
    has_webhook_secret: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
    has_payment_link: Boolean(process.env.STRIPE_PAYMENT_LINK?.trim()),
    has_nextauth_url: Boolean(process.env.NEXTAUTH_URL?.trim()),
    nextauth_url: process.env.NEXTAUTH_URL?.trim() || null,
  };

  let priceStatus: { ok: boolean; amount?: number; currency?: string; interval?: string; error?: string } = { ok: false };
  if (env.has_secret_key && env.has_price_id) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!.trim(), { apiVersion: '2026-03-25.dahlia' });
      const price = await stripe.prices.retrieve(process.env.STRIPE_PRICE_ID!.trim());
      priceStatus = {
        ok: true,
        amount: price.unit_amount ?? undefined,
        currency: price.currency,
        interval: price.recurring?.interval,
      };
    } catch (e) {
      priceStatus = { ok: false, error: e instanceof Error ? e.message : 'unknown' };
    }
  }

  const sub = await getUserSubscription(userId);

  return NextResponse.json({
    env,
    price: priceStatus,
    you: {
      isAdmin: sub.isAdmin,
      inTrial: sub.inTrial,
      trialDaysLeft: sub.trialDaysLeft,
      trialExpired: sub.trialExpired,
      isPremium: sub.isPremium,
      hasAccess: sub.hasAccess,
      subscriptionEnd: sub.subscriptionEnd,
      paymentFailed: sub.paymentFailed,
      stripeCustomerId: sub.stripeCustomerId,
    },
  });
});
