import { supabaseAdmin } from './supabase';

export interface SubscriptionState {
  isPremiun: boolean;
  inTrial: boolean;
  trialExpired: boolean;
  trialDaysLeft: number;
  subscriptionEnd: string | null;
  paymentFailed: boolean;
  hasAccess: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

export async function getUserSubscription(userId: string): Promise<SubscriptionState> {
  const { data } = await supabaseAdmin
    .from('users')
    .select('is_premium, trial_ends_at, subscription_end, payment_failed, stripe_customer_id, stripe_subscription_id')
    .eq('id', userId)
    .single();

  const now = Date.now();
  const isPremium = data?.is_premium === true;
  const trialEndsAt = data?.trial_ends_at ? new Date(data.trial_ends_at).getTime() : now + 7 * 86400000;
  const subscriptionEnd = data?.subscription_end ?? null;
  const subEndMs = subscriptionEnd ? new Date(subscriptionEnd).getTime() : 0;

  const inTrial = !isPremium && trialEndsAt > now;
  const trialExpired = !isPremium && trialEndsAt <= now;
  const trialDaysLeft = inTrial ? Math.ceil((trialEndsAt - now) / 86400000) : 0;
  const premiumActive = isPremium && subEndMs > now;
  const hasAccess = inTrial || premiumActive;

  return {
    isPremiun: isPremium,
    inTrial,
    trialExpired,
    trialDaysLeft,
    subscriptionEnd,
    paymentFailed: data?.payment_failed === true,
    hasAccess,
    stripeCustomerId: data?.stripe_customer_id ?? null,
    stripeSubscriptionId: data?.stripe_subscription_id ?? null,
  };
}

export async function markUserPremium(
  userId: string,
  stripeCustomerId: string,
  stripeSubscriptionId: string,
  periodEnd: number // unix timestamp
): Promise<void> {
  await supabaseAdmin.from('users').update({
    is_premium: true,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: stripeSubscriptionId,
    subscription_end: new Date(periodEnd * 1000).toISOString(),
    payment_failed: false,
  }).eq('id', userId);
}

export async function revokeUserPremium(stripeCustomerId: string): Promise<void> {
  await supabaseAdmin.from('users').update({
    is_premium: false,
    stripe_subscription_id: null,
    subscription_end: null,
  }).eq('stripe_customer_id', stripeCustomerId);
}

export async function renewUserPremium(stripeCustomerId: string, periodEnd: number): Promise<void> {
  await supabaseAdmin.from('users').update({
    is_premium: true,
    subscription_end: new Date(periodEnd * 1000).toISOString(),
    payment_failed: false,
  }).eq('stripe_customer_id', stripeCustomerId);
}

export async function markPaymentFailed(stripeCustomerId: string): Promise<void> {
  await supabaseAdmin.from('users').update({ payment_failed: true })
    .eq('stripe_customer_id', stripeCustomerId);
}

export async function getUserByStripeCustomer(stripeCustomerId: string): Promise<{ id: string; email: string } | null> {
  const { data } = await supabaseAdmin
    .from('users')
    .select('id, email')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();
  return data ?? null;
}
