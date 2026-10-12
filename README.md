# UpayaInd

Done-for-you job application platform: public website, student portal, employee workspace and admin portal.
The full product spec is in [`docs/SPEC.md`](docs/SPEC.md); choices beyond the spec are in [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Quick start

```bash
pnpm install
cp .env.example .env          # fill DATABASE_URL, AUTH_SECRET, VAULT_MASTER_KEY at minimum
pnpm db:deploy                # or: pnpm db:migrate during development
SEED_DEMO_PRICES=1 pnpm db:seed
pnpm dev
```

Open http://localhost:3000. Demo accounts (password `Upaya!Demo-2026`):

| Role | Email |
|---|---|
| Admin | admin@upayaind.test |
| Manager | manager@upayaind.test |
| Specialist | arjun@upayaind.test |
| Student | student@upayaind.test |

Staff accounts require two-step verification. In development, add the secret
`JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP` to any authenticator app.

Without third-party keys the app still runs: emails print to the terminal, uploads are stored in `.local-storage/`,
and AI or payment actions explain that the integration isn't configured. See `.env.example` for every variable.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Run the app |
| `pnpm typecheck` / `pnpm lint` | Static checks |
| `pnpm test` | Unit tests (Vitest, needs the `upayaind_test` database) |
| `pnpm e2e` | End-to-end tests (Playwright) |
| `pnpm db:migrate` / `pnpm db:deploy` | Prisma migrations |
| `pnpm db:seed` | Reference + demo data |
| `pnpm inngest:dev` | Local Inngest dev server for background jobs |
