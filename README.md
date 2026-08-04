# Bin Butlers NC

Professional, eco-friendly trash bin cleaning services in North Carolina.

## Environment Variables

This project requires the following environment variables. Copy `.dev.vars.example` to `.dev.vars` and fill in your values.

| Variable | Source | Required |
|----------|--------|----------|
| `STRIPE_SECRET_KEY` | [Stripe Dashboard](https://dashboard.stripe.com/apikeys) (test mode) | Yes |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard > Webhooks | Yes |
| `STRIPE_MONTHLY_PRICE_ID` | Stripe Dashboard > Products | Yes |
| `STRIPE_BIMONTHLY_PRICE_ID` | Stripe Dashboard > Products | Yes |
| `STRIPE_QUARTERLY_PRICE_ID` | Stripe Dashboard > Products | Yes |
| `STRIPE_ONETIME_PRICE_ID` | Stripe Dashboard > Products | Yes |
| `STRIPE_SETUP_FEE_PRICE_ID` | Stripe Dashboard > Products | Yes |
| `STRIPE_EXTRA_BIN_MONTHLY_PRICE_ID` | Stripe Dashboard > Products | Yes |
| `STRIPE_EXTRA_BIN_BIMONTHLY_PRICE_ID` | Stripe Dashboard > Products | Yes |
| `STRIPE_EXTRA_BIN_QUARTERLY_PRICE_ID` | Stripe Dashboard > Products | Yes |
| `ROUTIFIC_API_KEY` | [Routific Settings](https://beta.routific.com/settings?view=integrations) | Yes |
| `ROUTIFIC_WORKSPACE_ID` | Routific Settings | Yes |
| `ROUTIFIC_WEBHOOK_SECRET` | Routific Settings | For Routific webhooks |
| `AUTH_SECRET` | Generate: `openssl rand -hex 32` | Yes |
| `RESEND_API_KEY` | [Resend Dashboard](https://resend.com/api-keys) | For production |
| `NEXT_PUBLIC_GEOAPIFY_API_KEY` | [Geoapify Console](https://console.geoapify.com) | Yes |
| `GOOGLE_MAPS_API_KEY` | [Google Cloud Console](https://console.cloud.google.com) | Optional |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard > Apikeys | Yes |

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Runtime:** Cloudflare Workers (via `@cloudflare/next-on-pages`)
- **Database:** Cloudflare D1 (SQLite)
- **Auth:** Auth.js v5 (magic links via Resend)
- **Payments:** Stripe
- **Routing:** Routific Platform API
- **UI:** shadcn/ui + Tailwind CSS

## Getting Started

```bash
cp .dev.vars.example .dev.vars
# Fill in your values in .dev.vars

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

To run cron workers locally:

```bash
npx wrangler dev workers/daily-dispatch-cron/index.ts
npx wrangler dev workers/retry-cron/index.ts
```

## Verification

After making code changes, run both checks before treating the work as complete:

```bash
npm run lint
npm run build
```
