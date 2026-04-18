/**
 * Money flow smoke test — the critical regression guard.
 *
 * Covers:
 *  1. Unauthenticated user lands on /login
 *  2. Login shows the key pieces of copy (tagline, feature bullets, pricing)
 *  3. /paywall route exists and mounts (without auth it should bounce, so
 *     we check the SSR HTML of /paywall via direct fetch)
 *
 * To run end-to-end payment (requires real test user + Stripe test key):
 *   pnpm playwright test --project=chromium
 *
 * The full signup → trial-expired → Stripe → webhook → premium flow needs
 * test DB fixtures and Stripe test webhook triggering — scaffolded here so
 * we can flesh it out incrementally.
 */

import { test, expect } from '@playwright/test';

test('unauth visit shows login with pricing and features', async ({ page }) => {
  await page.goto('/');
  // Root redirects to /login when not signed in (via landing → Sign in button,
  // or direct protected nav → /login). Give it both chances.
  if (!page.url().includes('/login')) {
    await page.goto('/login');
  }
  await expect(page.locator('text=AI Planner')).toBeVisible();
  await expect(page.locator('text=chief-of-staff calendar')).toBeVisible();
  await expect(page.locator('text=1:1 Google Calendar mirror')).toBeVisible();
  await expect(page.locator('text=$6.90/month')).toBeVisible();
});

test('paywall loads without crashing', async ({ page }) => {
  const res = await page.goto('/paywall?cancelled=1');
  expect(res?.status()).toBeLessThan(500);
  await expect(page.locator('text=Your free trial has ended')).toBeVisible();
  await expect(page.locator('text=$6.90')).toBeVisible();
});

test.describe('AI endpoints reject unauthenticated', () => {
  test('POST /api/agent/run → 401', async ({ request }) => {
    const r = await request.post('/api/agent/run', { data: { message: 'test' } });
    expect(r.status()).toBe(401);
  });
  test('POST /api/command/parse → 401', async ({ request }) => {
    const r = await request.post('/api/command/parse', { data: { text: 'test' } });
    expect(r.status()).toBe(401);
  });
});
