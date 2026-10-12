# Decisions log

Choices not covered by docs/SPEC.md, or deliberate deviations. Newest last.

| ID | Decision | Why |
|---|---|---|
| D-001 | **Prisma 7** (`prisma-client` generator + `@prisma/adapter-pg`) instead of Prisma 5/6 classic engine. | Rust-free query engine, smaller serverless bundles, works with Neon/Supabase pooling. Same schema language; spec says "Prisma". |
| D-002 | Added `scripts/migrate-wasm.mjs` (`pnpm db:migrate:offline` / `db:deploy:offline`). | Some sandboxes can't download Prisma's native schema engine. The script uses Prisma's official WASM schema engine and writes standard migrations. CI/Vercel use the normal CLI. |
| D-003 | Schema additions beyond §8: back-relations required by Prisma; `AuthToken` (verify/reset/invite, hashed); `Counter` (invoice numbers); `JdAnalysisCache`; `ProductEvent`; helper fields (`Market.locale`, `StudentProfile.assignmentQueue/awaitingSince/consentVersion/internalNotes`, `Subscription.remindersSent`, `ResumeVersion.jdHash/validation/coverLetter`, `Message.isBroadcast/emailedAt`, `LeaveRequest.coverEmployeeId`, `LoginEvent.email/reason`, `CmsEntry.canonicalUrl/noindex/sortOrder`, `FileObject.studentId/filename`, `MockInterview.durationMin/meetingLink`, `User.lastActiveAt/deletionRequestedAt`). Extra DB constraints: one open WorkSession per employee; non-negative payments. | Needed to implement the flows exactly as specified. |
| D-004 | Env: core variables always required; third-party integrations required in **production** only. In dev/test: emails print to the console, files go to `.local-storage/`, rate limits are in-memory, AI/Stripe actions show a clear "not configured" error. | Lets a developer run the whole app locally while production still fails fast (§14). |
| D-005 | Google sign-in implemented without the Auth.js Prisma adapter (users/accounts are upserted in the `signIn` callback). Staff accounts can't use Google. | JWT sessions don't need the adapter, and our `User` model has required fields the adapter can't fill. |
| D-006 | Staff 2FA: after password login the JWT carries `mfa = setup|verify`; middleware forces `/2fa` until a server-verified TOTP code. The server sends a 60-second HMAC "mfa proof" through `update()` so the client can't self-elevate. | §10: TOTP mandatory for staff. |
| D-007 | Per-role session length enforced inside the JWT (`sessionExpiresAt`: staff 12h, students 7d). Status/role are re-read from the DB every 5 minutes, so deactivation takes effect quickly. | §10. |
| D-008 | Fonts are self-hosted from the Fontsource builds (OFL) via `next/font/local`. | No build-time dependency on Google Fonts; better privacy and LCP. |
| D-009 | CSP allows `'unsafe-inline'` scripts (no per-request nonces). | Nonces force every page to be dynamic, which would break SSG/ISR for the marketing site (§6.1 performance). Everything else is locked down. |
| D-010 | Messages split into one JSON file per area (`src/i18n/messages/en/*.json`). | Keeps copy owned by each feature; still a single next-intl catalogue. |
| D-011 | Seeded US plan prices are **0** (blocked by the price floor) unless `SEED_DEMO_PRICES=1`. Pricing pages show "[Price to be set]" until the admin sets real prices. | §16/§20: prices must be confirmed by the client. |
| D-012 | Old `/blog/*` URLs are not blanket-redirected (the new blog uses `/blog/[slug]`); unknown blog slugs redirect to `/blog` instead. | Avoids breaking new blog posts while still honouring §18. |
