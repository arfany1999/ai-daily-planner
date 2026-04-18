# Launch checklist

Operational tasks that need you at the console — code is all in place.

## 1. Stripe in live mode

```
curl -s https://aidaily.mrgren.store/api/stripe/health \
  -H "Cookie: <your session cookie>" | jq .env
```

Expect `"stripe_mode": "live"` and `"live_mode": true`.

If `test`: in Vercel → Settings → Environment Variables, replace:
- `STRIPE_SECRET_KEY` → `sk_live_...` (Stripe Dashboard → Developers → API keys → "Reveal live key")
- `STRIPE_WEBHOOK_SECRET` → matching `whsec_...` from the **live** webhook endpoint
- `STRIPE_PAYMENT_LINK` → live-mode Payment Link URL

Redeploy after changing env.

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

Pick one (free):
- **Better Uptime** (betterstack.com) — 10 monitors free
- **UptimeRobot** — 50 monitors free
- **Vercel Analytics** — already on, but it's observability not uptime

Configure:
- Monitor URL: `https://aidaily.mrgren.store/api/health`
- Interval: 5 min
- Alert via: email + SMS (or Slack/Discord webhook)
- Expected status: 200

## 4. ERROR_WEBHOOK_URL (optional)

Set this in Vercel env to pipe `logError` + client boundary crashes to Discord/Slack/Zapier:

```
ERROR_WEBHOOK_URL=https://hooks.slack.com/services/XXX
# or
ERROR_WEBHOOK_URL=https://discord.com/api/webhooks/XXX
```

Receives JSON: `{ pathname, message, user_id, at, env }`.

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
