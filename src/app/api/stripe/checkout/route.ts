import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' }); }

export const POST = withAuth(async (_req, userId) => {
  const stripe = getStripe();
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('email, stripe_customer_id')
    .eq('id', userId)
    .single();

  if (!user?.email) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const base = process.env.NEXTAUTH_URL!.trim();

  // Reuse existing Stripe customer or create new one
  let customerId = user.stripe_customer_id as string | undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId },
    });
    customerId = customer.id;
    await supabaseAdmin.from('users').update({ stripe_customer_id: customerId }).eq('id', userId);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    success_url: `${base}/home?subscribed=1`,
    cancel_url: `${base}/paywall?cancelled=1`,
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { userId },
    },
  });

  return NextResponse.json({ url: session.url });
});
