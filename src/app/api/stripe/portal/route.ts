import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' });
}

export const POST = withAuth(async (_req, userId) => {
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single();

  if (!user?.stripe_customer_id) {
    return NextResponse.json({ error: 'No Stripe customer found' }, { status: 404 });
  }

  const base = process.env.NEXTAUTH_URL!.trim();

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id as string,
    return_url: `${base}/settings`,
  });

  return NextResponse.json({ url: session.url });
});
