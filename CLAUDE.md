# UpayaInd platform

Full spec: docs/SPEC.md. Read the relevant section before any task. Log new decisions in docs/DECISIONS.md.

## Stack
Next.js 15 App Router + TS strict, Tailwind v4 + shadcn-style UI (src/components/ui), Prisma 7 (pg driver adapter) + Postgres, Auth.js v5,
Inngest jobs, R2 storage, Anthropic API for resume AI, @react-pdf/renderer + docx, Resend, Stripe.

## Rules
- Server-side auth on every action: `await requireRole([...])`; for student data from staff use `assertEmployeeCanAccessStudent`.
- Always use Prisma `select`; never return passwordHash, totpSecretEnc or *Enc fields to the client.
- Validate all input with zod (shared schemas in src/lib/schemas).
- Money = integer minor units + currency. Never sum across currencies.
- Store UTC; display in user timezone (src/lib/dates.ts, src/lib/format.ts).
- Business logic in src/server/services (pure, unit-tested); UI never calls Prisma directly.
- Resume AI must obey the truthfulness rules in SPEC §9.4; always run the validator.
- Every UI string through next-intl. Messages live in src/i18n/messages/en/<area>.json (one namespace set per file).
- Mobile-first; check 375px for every new screen.
- Brand tokens: royal #0A35D6, blue #0A7CF0, sky #18B8F2, ink #0B1846 (src/app/globals.css).
- Prisma client import: `@/server/db` (server) — enums for client components: `@/generated/prisma/enums`.

## Commands
pnpm dev | pnpm typecheck | pnpm lint | pnpm test | pnpm e2e | pnpm db:migrate | pnpm db:seed
Offline sandboxes without access to binaries.prisma.sh: `pnpm db:migrate:offline <name>` / `pnpm db:deploy:offline`.

## Demo logins (seed)
Password `Upaya!Demo-2026` — admin@upayaind.test, manager@upayaind.test, arjun@upayaind.test, student@upayaind.test.
Staff 2FA (dev only): add secret `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP` to an authenticator app.

## Definition of done
Typecheck + lint + unit + e2e green, responsive at 375/768/1280, a11y (axe) clean, spec acceptance criteria met.
