# Launch checklist

Operational tasks that need you at the console — code is all in place.

## 1. Stripe in live mode

**Check current mode** (sign in to the app first so the session cookie is set, then in the same browser hit):

```
https://aidaily.mrgren.store/api/stripe/health
```

Look at `env.stripe_mode`. If it says `"live"`, you're done. If `"test"` or `"unknown"`, flip it:

**A. Get your live keys** (Stripe Dashboard — top-left toggle **"Test mode" → OFF**):
1. Developers → API keys → "Reveal live key" → copy the `sk_live_...`
2. Developers → Webhooks → find (or create) endpoint `https://aidaily.mrgren.store/api/webhooks/stripe` in **live** mode → reveal signing secret → copy the `whsec_...`
3. Payment Links → create a new Payment Link in live mode for the $6.99/month price → copy the `https://buy.stripe.com/...` URL
4. Products/Prices → copy the **live** price ID for $6.99/month (starts `price_...`)

**B. Put them in Vercel** (Settings → Environment Variables → edit each for **Production**):
- `STRIPE_SECRET_KEY` → your `sk_live_...`
- `STRIPE_WEBHOOK_SECRET` → your live `whsec_...`
- `STRIPE_PAYMENT_LINK` → the live Payment Link URL
- `STRIPE_PRICE_ID` → live price ID

**C. Redeploy:**
```
git commit --allow-empty -m "flip Stripe to live mode" && git push
```
Vercel auto-deploys. Re-check `/api/stripe/health` — `stripe_mode` should now read `"live"` and `price.amount` should be `699`.

## 2. Google OAuth verification

You're almost certainly in **Testing** mode right now (capped at 100 test users).

Go to: https://console.cloud.google.com/apis/credentials/consent

Before submitting:
- App home page URL: `https://aidaily.mrgren.store`
- Privacy policy URL: `https://aidaily.mrgren.store/privacy`
- Terms of service URL: `https://aidaily.mrgren.store/terms`
- Authorised domains: `mrgren.store`
- Scopes requested: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/calendar`
- Scope justification for `calendar`: *"Required to mirror user-created schedule blocks from AI Planner into their Google Calendar, and to display their existing calendar events in the planner UI. All calendar writes are explicit user actions."*

Submit for verification → allow 2-4 weeks. While pending, testing users still work; new Gmail users see an unverified-app warning they can click past.

**Do not add Gmail scope** — we removed it. If Google's scope list still shows it cached, re-save the consent screen to clear.

## 3. Uptime monitor

Public liveness probe lives at `https://aidaily.mrgren.store/api/ping` (no auth, no DB — pure edge health). Use that, **not** `/api/health` (which is auth-gated and leaks state).

Pick one (free tier is enough):
- **UptimeRobot** (https://uptimerobot.com) — 50 monitors free, 5-min interval
- **Better Stack / Better Uptime** (https://betterstack.com/better-uptime) — 10 monitors free, 30-sec interval

**UptimeRobot setup (copy-paste):**
1. Sign up → "Add New Monitor"
2. Monitor Type: `HTTP(s)`
3. Friendly Name: `AI Planner`
4. URL: `https://aidaily.mrgren.store/api/ping`
5. Monitoring Interval: `5 minutes`
6. Alert Contacts: your email (add SMS if you want pages)
7. Keyword (optional, under Advanced): `"status":"ok"` — alerts if body ever stops containing this

Expected response: `200 {"status":"ok","ts":...}` with `cache-control: no-store`.

**Better Stack setup:** same URL, set "Expected keyword" to `ok` under Advanced.

## 4. ERROR_WEBHOOK_URL (optional)

Pipes `logError(...)` + client error boundary crashes to Slack / Discord / generic JSON webhook. Auto-detects format from the URL.

**Slack:**
1. https://api.slack.com/apps → Create New App → From scratch → pick workspace
2. Features → "Incoming Webhooks" → toggle on → "Add New Webhook to Workspace" → pick channel
3. Copy the `https://hooks.slack.com/services/...` URL
4. Vercel → Settings → Environment Variables → add:
   ```
   ERROR_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../xxx
   ```
5. Redeploy

**Discord:**
1. Channel → gear icon → Integrations → Webhooks → New Webhook → copy URL
2. Vercel → same env var:
   ```
   ERROR_WEBHOOK_URL=https://discord.com/api/webhooks/.../...
   ```
3. Redeploy

**Generic** (Zapier, your own endpoint): any other URL receives raw JSON:
`{ pathname, message, user_id, at, env }`.

The code auto-detects Slack/Discord by URL and formats the payload accordingly — no extra config needed.

## 5. Sanity checks

- [ ] `npm run test:e2e` — all 4 green against prod
- [ ] Create a fresh (non-admin) account → see onboarding tour
- [ ] In Supabase, set that account's `trial_ends_at = NOW() - INTERVAL '1 day'` → visit `/home` → auto-redirect to Stripe
- [ ] Pay with test card `4242 4242 4242 4242` → land on `/home?subscribed=1` with access
- [ ] Settings → "Manage subscription" → Stripe portal opens
- [ ] Settings → "Delete account and all data" → confirms + removes everything

## 6. Known limitations to be aware of (not blockers)

- **Middleware `checkAccess` fail-open on Supabase errors.** If Supabase has an outage, users don't get kicked. Choice: better UX but worse enforcement.
- **Rate limiter is in-memory per serverless instance.** A motivated attacker with many IPs bypasses it. For harder guarantees move to Upstash Redis.
- **Google Calendar writes are not retried on transient 5xx from Google.** Local Supabase state is always consistent, but a one-in-ten-thousand write can drop from Google. User can see and re-create manually.
