# Code conventions

How this codebase is put together. Read with `CLAUDE.md` and `docs/SPEC.md`.

## Layout

```
src/app/(auth)/…           login, signup, 2fa, reset (AuthShell)
src/app/(marketing)/…      public site (light only, SSG/ISR)
src/app/app/(shell)/…      student portal pages (PortalShell portal="app")
src/app/app/onboarding     full-screen wizard (outside the shell)
src/app/work/(shell)/…     employee workspace
src/app/admin/(shell)/…    admin portal (ADMIN; MANAGER for people/delivery sections)
src/app/api/…              route handlers (webhooks, files, inngest, heartbeat …)
src/components/ui          primitives (Button, Input/Field/Select, Card, Badge, Dialog, Dropdown, Tabs, Table, Progress, Avatar, EmptyState, Logo)
src/components/portal      PortalShell + PageHeader, StatusPill, StatCard, CompanyLogo, Pagination/withParams, useServerAction
src/server/auth            Auth.js config, rbac.ts (can()), guards.ts (requireRole/requireStudent/requireStaff), access.ts (assertEmployeeCanAccessStudent)
src/server/services        business logic (pure functions over `db`), one file per area
src/server/jobs            background jobs: defineJob() in the area's file; emit() from "@/server/jobs"
src/lib                    isomorphic helpers (format, dates, url-normalize, schemas)
src/resume                 resume JSON schema, templates, renderers
```

## Server actions

```ts
"use server";
import { requireRole } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";

export async function approveLeave(id: string, note: string) {
  return safeAction(async () => {
    const user = await requireRole(["MANAGER", "ADMIN"]);   // ALWAYS first
    const input = schema.parse({ id, note });                 // zod
    return leaveService.decide(user, input);                  // logic in a service
  }, "Leave approved");
}
```

- Put actions in `actions.ts` next to the route.
- Throw `UserError` (src/server/errors.ts) or a named domain error for messages the user should see.
- Client side: `const { run, pending } = useServerAction(approveLeave)` shows toasts and refreshes.
- Staff touching student data: `await assertEmployeeCanAccessStudent(user, studentId)`.

## Data access

- `import { db } from "@/server/db"` on the server only. Always `select` the fields you need.
- Never send `passwordHash`, `totpSecretEnc` or any `*Enc` column to the client.
- Money: integer minor units + currency; format with `formatMoney`. Never add different currencies.
- Time: store UTC. Display with `formatInTz(date, user.timezone)`. Day boundaries with `dayRangeInTz`.
- Lists: cursor pagination, 25 per page.

## UI

- Look and feel follows the approved design: ink sidebar, `canvas` page background, white `surface` cards with 16–20px radius and `border-border`, Fraunces only for marketing display headings, Inter everywhere else, `tabular` for numbers.
- Colours via tokens (`bg-surface`, `text-muted-foreground`, `bg-primary`, `brand-gradient`…), so portal dark mode works.
- Every string through next-intl. Each area owns a messages file in `src/i18n/messages/en/` (core, auth, nav, marketing, billing, workspace, resume, student, work, admin, messaging, cms, emails). Namespaces must be unique across files.
- Accessible by default: real `<button>`/`<a>`, labels for inputs (`Field` + `fieldA11y`), `aria-label` on icon buttons, 44px targets, errors announced (`role="alert"`).
- Mobile first: check 375px; wide tables go in `TableWrap` (scrolls inside its box).

## Tests

- Unit tests in `tests/unit/*.test.ts` (Vitest) against a real Postgres test DB; helpers in `tests/setup/db.ts` (`resetDb`, `makeMarket`, `makeEmployee`, `makeStudent`).
- E2E in `tests/e2e` (Playwright).
