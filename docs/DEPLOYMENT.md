# Deploying UpayaInd

Target setup (SPEC §4): Vercel (app) + Neon Postgres + Cloudflare R2 + Inngest Cloud + Resend + Stripe + Upstash Redis + Sentry.

## 1. Accounts and keys

| Service | What to create | Env vars |
|---|---|---|
| Neon | A Postgres 16 database (enable `pg_trgm`, allowed by default) | `DATABASE_URL` |
| Cloudflare R2 | A **private** bucket + an API token with read/write on it | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` |
| Anthropic | API key | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), optional `ANTHROPIC_MODEL_FAST`, optional `ANTHROPIC_PRICE_*_PER_MTOK` for cost logging |
| Stripe | Secret key; webhook endpoint `https://<domain>/api/webhooks/stripe` with events `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| Resend | Verified sending domain | `RESEND_API_KEY`, `EMAIL_FROM` |
| Inngest | App synced to `https://<domain>/api/inngest` | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` |
| Upstash | Redis database | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| Google (optional) | OAuth client, redirect `https://<domain>/api/auth/callback/google` | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` |
| Analytics (optional) | GA4 property, Microsoft Clarity project, Cal.com link | `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_CLARITY_ID`, `CALCOM_LINK` |
| Sentry (optional) | Project DSN | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` |

Also generate: `AUTH_SECRET` (`openssl rand -base64 48`) and `VAULT_MASTER_KEY` (`openssl rand -base64 32`).
**Keep `VAULT_MASTER_KEY` safe and never change it** without re-wrapping data keys — losing it makes saved student logins unreadable.

In production every integration variable is required; the app refuses to boot if one is missing (SPEC §14).

## 2. Database

```bash
pnpm install
pnpm db:deploy        # prisma migrate deploy
pnpm db:seed          # reference data (markets, resume styles, plans, leave types, settings, CMS drafts)
```

The seed also creates **demo users and fake data** when the database has no students. For production, seed a
staging database for demos and create real staff from **Admin → Employees** instead (delete the demo accounts if you
seeded production).

## 3. Vercel

- Framework preset: Next.js. Build command: `pnpm build`. Node 20+.
- Add all env vars to Production and Preview (Preview should use a separate database and Stripe test keys).
- `NEXT_PUBLIC_APP_URL` = your public URL (e.g. `https://upayaind.com`).

## 4. Before launch (SPEC §19)

1. **Prices:** Admin → Plans & pricing. Placeholder prices are 0 and cannot be bought until set (price floor guard). Click "Create in Stripe" for each price.
2. **Legal pages:** Admin → Content → Legal. Replace the five drafts with approved text and publish (publishing is blocked while "[DRAFT…]" remains).
3. **Business details:** Admin → Settings (legal name, address, tax IDs per market — printed on invoices).
4. **Success stories, team, founder note:** Admin → Content (real people, with consent).
5. **Staff:** Admin → Employees → invite. Each person sets a password and two-step verification on first login.
6. Old-site redirects are already in `next.config.ts` (SPEC §18). Rotate the old system's credentials at cut-over.
7. Restore test: restore a Neon branch to a point in time and boot staging against it.
