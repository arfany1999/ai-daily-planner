import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Default payment link — override via STRIPE_PAYMENT_LINK env in Vercel if needed.
// https://stripe.com/docs/payment-links — we append client_reference_id so the
// checkout.session.completed webhook can map the payment back to the user.
const DEFAULT_PAYMENT_LINK = 'https://buy.stripe.com/00w4gyave28qayJeglbAs08';

export const POST = withAuth(async (_req, userId) => {
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('email')
    .eq('id', userId)
    .single();

  const base = (process.env.STRIPE_PAYMENT_LINK || DEFAULT_PAYMENT_LINK).trim();
  const params = new URLSearchParams({
    client_reference_id: userId,
    ...(user?.email ? { prefilled_email: user.email } : {}),
  });
  const url = `${base}?${params.toString()}`;

  return NextResponse.json({ url });
});
