import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { markUserPremium, renewUserPremium, revokeUserPremium, markPaymentFailed, getUserByStripeCustomer } from '@/lib/subscription';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY!.trim(), { apiVersion: '2026-03-25.dahlia' }); }

export async function POST(req: Request) {
  const stripe = getStripe();
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!.trim());
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Idempotency: Stripe retries on our timeout. Record event.id; skip duplicates.
  // Requires table:
  //   CREATE TABLE stripe_events (event_id TEXT PRIMARY KEY, type TEXT, processed_at TIMESTAMPTZ DEFAULT NOW());
  try {
    const { error: insErr } = await supabaseAdmin
      .from('stripe_events')
      .insert({ event_id: event.id, type: event.type });
    if (insErr && (insErr.code === '23505' /* unique_violation */ || /duplicate/i.test(insErr.message))) {
      return NextResponse.json({ received: true, duplicate: true });
    }
  } catch { /* table missing — fall through and keep behaviour */ }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== 'subscription') break;

      const customerId = session.customer as string;
      const subscriptionId = session.subscription as string;

      // Default: 30 days from now; override from latest invoice if available
      let periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
      try {
        const invoices = await stripe.invoices.list({ subscription: subscriptionId, limit: 1 });
        if (invoices.data[0]?.period_end) periodEnd = invoices.data[0].period_end;
      } catch { /* use default */ }

      // Find userId from metadata or DB
      const userId: string | undefined =
        ((session as unknown as Record<string, unknown>).client_reference_id as string | undefined)
        || (await getUserByStripeCustomer(customerId))?.id
        || undefined;

      if (userId) {
        await markUserPremium(userId, customerId, subscriptionId, periodEnd);
      }
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const periodEnd = invoice.period_end ?? Math.floor(Date.now() / 1000) + 30 * 86400;
      await renewUserPremium(customerId, periodEnd);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      await markPaymentFailed(customerId);

      // Send email via Formspree
      const user = await getUserByStripeCustomer(customerId);
      if (user?.email) {
        await fetch('https://formspree.io/f/xaqawjyo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            message: `Payment failed for AI Daily subscription. Customer: ${customerId}`,
            _subject: 'AI Daily — Payment Failed',
          }),
        }).catch(() => {});
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await revokeUserPremium(sub.customer as string);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
