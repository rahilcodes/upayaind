# Deploying UpayaInd

Target setup (SPEC §4): Vercel (app) + Neon Postgres + Cloudflare R2 + Inngest Cloud + Resend + Stripe + Upstash Redis + Sentry.

## 1. Accounts and keys

| Service | What to create | Env vars |
|---|---|---|
| Neon | A Postgres 16 database (enable `pg_trgm`, allowed by default) | `DATABASE_URL` |
| Cloudflare R2 | A **private** bucket + an API token with read/write on it | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` |
| AI: OpenAI **or** Anthropic (D-136) | One API key. `AI_PROVIDER` picks the provider (unset: OpenAI if only `OPENAI_API_KEY` is set, otherwise Anthropic) | OpenAI: `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-5.5`), optional `OPENAI_MODEL_FAST`, `OPENAI_BASE_URL`, `OPENAI_PRICE_*_PER_MTOK`. Anthropic: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), optional `ANTHROPIC_MODEL_FAST`, `ANTHROPIC_PRICE_*_PER_MTOK` |
| Stripe | Secret key; webhook endpoint `https://<domain>/api/webhooks/stripe` with events `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| Email: Resend **or** SMTP (D-150) | Resend: verified sending domain. SMTP: any mailbox you own (Hostinger `smtp.hostinger.com:465`, Google Workspace `smtp.gmail.com:587` + app password, Zoho…). `EMAIL_FROM` must use that mailbox/domain. | `RESEND_API_KEY` **or** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`; `EMAIL_FROM` |
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

## 5. Self-hosted VPS notes (nginx in front of `pnpm start`)

- **Visitor country (D-151):** install `libnginx-mod-http-geoip2`, download the free DB-IP country database to `/usr/share/GeoIP/dbip-country-lite.mmdb`, add `/etc/nginx/conf.d/geoip2.conf` (`geoip2 … { $geoip2_country_code default=XX source=$remote_addr country iso_code; }`) and `proxy_set_header X-Country-Code $geoip2_country_code;` in the site's `location /`. Refresh the database monthly (`dbip-country-lite-YYYY-MM.mmdb.gz`). Test: `curl -sI https://<domain>/ | grep -i set-cookie` from an Indian/UK IP shows `market=IN` / `market=UK`.
- **Email (D-150):** live upayaind.com uses **Resend** (domain upayaind.com verified; DNS records on `send` and `resend._domainkey` at Namecheap; From `noreply@upayaind.com`). Microsoft 365 SMTP was dropped because the tenant's security defaults block SMTP AUTH. In general, set either `RESEND_API_KEY` or the `SMTP_*` variables in `.env`. upayaind.com mail is on Microsoft 365: use `smtp.office365.com:587` (`SMTP_SECURE=0`) and first enable **Authenticated SMTP** for the sending mailbox (Exchange admin center → Mailboxes → the mailbox → Manage email apps), otherwise login fails with `535 5.7.139`, restart the service, then check `/api/health` (`email: "smtp"|"resend"`) and that the red "Emails are not being sent" banner is gone from `/admin`. Send yourself a password-reset email to confirm.
- **After each deploy:** `git pull && pnpm install --frozen-lockfile && pnpm db:deploy && pnpm db:seed --reference-only && pnpm build && systemctl restart <service>`. Migrate and seed **before** `pnpm build`: the marketing pages are pre-rendered at build time from the database, so a build that runs before the seed ships stale prices until ISR refreshes them. `--reference-only` upserts markets, plans (incl. the India packages), settings defaults and CMS drafts without touching users.
