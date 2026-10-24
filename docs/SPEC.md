# UpayaInd Platform: Build Specification

**Version:** 1.0 · **Date:** 11 October 2026 · **Prepared by:** Creativals.com
**Audience:** The developer building the platform with Claude Code
**Status:** Ready to build

> **How to use this document.** Put this file in the root of the new repository as `docs/SPEC.md`, and copy the "CLAUDE.md starter" from Appendix A into `CLAUDE.md` at the repo root. Then build milestone by milestone (Section 17). Each milestone has a ready-to-paste Claude Code prompt and acceptance criteria. Every decision you need (stack, data model, flows, rules, screens) is made here. If something isn't covered, follow the closest pattern in this document, then list it in `docs/DECISIONS.md` for review.

---

## 1. What we are building

UpayaInd is a **done-for-you job application service**. Students (job seekers) pay a subscription. UpayaInd's employees then apply to jobs **on the student's behalf** every working day, using a resume **tailored to each job description**. The student never applies to jobs themselves. They focus on upskilling and interviews, while UpayaInd provides interview preparation and training.

We are building the **whole platform from scratch**. Nothing from the current upayaind.com codebase is reused. It has four parts:

1. **Public website.** A fast, beautiful, SEO-friendly marketing site that converts visitors into paying students. It must be excellent on mobile and desktop.
2. **Student portal.** Students sign up, pay, complete their profile, and track every application made for them: company, role, date, job link, the exact resume used, and status. They also message their assigned employee and access interview prep.
3. **Employee portal.** Employees see their assigned students and daily targets. They generate a JD-tailored resume for each job, log each application with its job link (the resume is attached automatically), and update statuses. They also message students, clock in and out, see their worked time, and apply for leave.
4. **Admin portal.** Admins manage employees, students, assignments (auto and manual), plans and pricing per country, payments, targets, attendance, leave, content (CMS), resume styles per country, and reports.

**Market scope.** The platform launches for the **United States**. It must be built to support **any country** without code changes: country-specific pricing and currency, resume style rules (US resume vs UK CV and so on), date formats, time zones and payment gateways.

### 1.1 Core loop (the product in one line)

`Visitor → Sign up → Pay → Auto-assigned to employee → Profile + master resume → Daily tailored applications → Student tracks everything → Interviews → Hired → Renew/refer`

### 1.2 Success criteria for launch

- A student can sign up, pay, and get auto-assigned to an employee within 1 minute, with no human involved.
- An employee can go from "pasted JD" to "tailored resume PDF downloaded" in **under 60 seconds**, and log the application in **under 20 seconds**.
- A student sees each logged application on their dashboard immediately, with the exact resume file used.
- Admin can see, per employee per day: applications done vs target, hours worked and login times.
- Lighthouse scores ≥ 90 (Performance, SEO, Accessibility, Best Practices) on the homepage, both mobile and desktop.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Student** | The paying customer (job seeker). Also called "candidate" in some UI copy. |
| **Employee** | UpayaInd staff member who applies to jobs for students. Also called "specialist" in UI copy. |
| **Manager** | Admin-lite role: manages employees, assignments, leave and attendance, but not pricing or settings. |
| **Interview coach** | Staff member (role `COACH`) who only schedules and runs mock interviews / training with students. No job applications, vault or assignments (D-140). |
| **Admin** | Full access (super admin). |
| **Market** | A country UpayaInd sells in (US at launch). It drives currency, plans, resume style, time zone defaults and payment gateway. |
| **Plan** | A subscription product (e.g. Basic / Standard / Premium) with a price per market and billing interval, and a **daily application target**. |
| **Assignment** | The link between a student and the employee currently responsible for them. |
| **Master profile** | The student's structured career data (experience, education, skills...), the single source of truth for every resume. |
| **Base resume** | The student's general resume generated from the master profile. |
| **Tailored resume** | A resume version generated for one specific job description (JD). It is immutable once used in an application. |
| **Application** | One job the employee applied to on the student's behalf. |
| **Credential vault** | Encrypted storage of the student's job-portal and email logins, used by the assigned employee to apply. |
| **Daily target** | The number of applications per working day the plan promises (e.g. 25). |
| **Work session** | One clock-in → clock-out period of an employee. |
| **Working window** | Admin-set clock-in/clock-out times and timezone per employee; when enforced, clock-in and application logging are only allowed inside it (D-139). |

---

## 3. Roles and permissions

Enforce all rules **on the server** in every server action and route handler. Never rely on hiding UI.

| Capability | Student | Employee | Manager | Admin |
|---|---|---|---|---|
| Sign up themselves | ✅ | ❌ (created by admin) | ❌ | ❌ |
| View own dashboard / applications | ✅ own | — | — | — |
| Edit own profile, preferences, upload resume | ✅ | — | — | — |
| Add/update credential vault entries | ✅ own | ❌ (read only, assigned students, reveal is logged) | ❌ | ❌ (metadata only, never secrets) |
| See assigned students | — | ✅ only assigned | ✅ all | ✅ all |
| Generate tailored resumes | ❌ | ✅ assigned | ✅ | ✅ |
| Log / edit applications | ❌ | ✅ assigned (edit own entries within 7 days) | ✅ | ✅ |
| Update application status | ❌ (can report an interview/offer) | ✅ | ✅ | ✅ |
| Message | ✅ with assigned employee | ✅ with assigned students | ✅ view all threads | ✅ view all threads |
| Clock in/out, view own timesheet | — | ✅ | ✅ | ✅ |
| Apply for leave | — | ✅ | ✅ | — |
| Approve leave | — | ❌ | ✅ | ✅ |
| Create/deactivate employees | — | ❌ | ✅ | ✅ |
| Assign / reassign students | — | ❌ | ✅ | ✅ |
| Plans, pricing, coupons, markets | — | ❌ | ❌ | ✅ |
| Payments, refunds | — | ❌ | view | ✅ |
| CMS (pages, blog, stories, FAQ) | — | ❌ | ❌ | ✅ |
| Resume styles & templates | — | ❌ | ❌ | ✅ |
| Settings, audit log | — | ❌ | view audit | ✅ |

**Team lead (`TEAM_LEAD`, D-149):** a MANAGER superset for whoever runs the business day to day — every student, employee, assignment, attendance, leave, report, lead, content and prep screen — but no commercial section (plans, coupons, payments, markets, manual billing) and no Settings. An ADMIN chooses the admin sections a team lead may open under Settings → Team lead access; money sections are off by default.

**Interview coach (`COACH`, D-140):** staff login (password + 2FA) limited to the `/coach` portal: own mock-interview sessions and scorecards, students assigned via `StudentProfile.coachId` or a booked session. No access to applications, resumes, vault or messages.

**Row-level rule:** an employee may read or write data for a student **only** while an active assignment exists between them. Implement it once as a helper, `assertEmployeeCanAccessStudent(employeeId, studentId)`, and call it everywhere.

---

## 4. Tech stack (decided, don't change)

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript (strict)** | Server Components by default; Server Actions for mutations; Route Handlers for webhooks and file streams |
| UI | **Tailwind CSS v4 + shadcn/ui + lucide-react** | Brand tokens in Section 13 |
| Forms & validation | **react-hook-form + zod** | One zod schema shared by client and server |
| Database | **PostgreSQL 16** (Neon or Supabase Postgres) | |
| ORM | **Prisma** | Schema in Section 8 |
| Auth | **Auth.js (NextAuth v5)** with Credentials (email + password, argon2id) + Google OAuth for students | JWT sessions with `role`, `userId`; TOTP 2FA for Employee/Manager/Admin |
| File storage | **Cloudflare R2** (S3 API) | Private bucket; short-lived signed URLs only |
| Background jobs & cron | **Inngest** | Resume generation, notifications, daily rollups, renewals |
| AI | **OpenAI** (Chat Completions, `OPENAI_MODEL`, default `gpt-5.5`) or **Anthropic Claude** (`@anthropic-ai/sdk`, `ANTHROPIC_MODEL`), chosen by `AI_PROVIDER` (D-136) | Same prompts, schemas and §9.4 validator for both |
| Resume output | **@react-pdf/renderer** (PDF) + **docx** (DOCX) | Both rendered from the same resume JSON |
| Email | **Resend + React Email** | Transactional templates in `/emails` |
| WhatsApp (P1) | Twilio WhatsApp or Interakt | Behind a `NotificationChannel` interface |
| Payments | **Stripe** (US and international) + **Razorpay** (India, P1) | Behind a `PaymentProvider` interface, chosen per market |
| Rich text (CMS) | **Tiptap** | Stored as JSON + rendered HTML |
| i18n | **next-intl** | English only at launch; every UI string goes through it |
| Rate limiting | **Upstash Redis + @upstash/ratelimit** | Login, signup, AI generation, contact form |
| Analytics | GA4 + Microsoft Clarity (marketing site only) | Plus server-side event table for product metrics |
| Errors & logs | **Sentry** | |
| Hosting | **Vercel** (app) + Neon (DB) + R2 + Inngest Cloud | Environments: dev, staging, production |
| Testing | **Vitest** (unit) + **Playwright** (e2e) | |
| CI | GitHub Actions: typecheck, lint, test, prisma migrate check | |

---

## 5. Site map and routes

```
PUBLIC (marketing, SSG/ISR, SEO-optimized)
/                         Home
/how-it-works             Process timeline + dashboard demo
/pricing                  Geo-detected market pricing (?market=us override)
/success-stories          List  → /success-stories/[slug]
/about                    Story + team
/for/[audience]           Landing pages (h1b-opt, professionals, freshers …) from CMS
/blog                     List  → /blog/[slug]
/faq
/contact                  Form + book-a-call embed + WhatsApp
/legal/[slug]             privacy, terms, refund, guarantee, cookies
/sitemap.xml  /robots.txt

AUTH
/login  /signup  /forgot-password  /reset-password  /verify-email  /2fa

STUDENT  (/app/*  role=STUDENT)
/app                      Dashboard
/app/onboarding           Multi-step wizard (blocks portal until done)
/app/applications         All applications (table + filters) → /app/applications/[id]
/app/companies            Applications grouped by company
/app/interviews           Upcoming / past interviews
/app/resumes              Master resume + every tailored version
/app/messages             Thread with assigned employee
/app/prep                 Interview prep library + mock interview bookings
/app/profile              Personal info, job preferences, master profile
/app/vault                Credential vault (add/update logins)
/app/billing              Plan, renewal, invoices, upgrade
/app/settings             Password, notifications, delete account

EMPLOYEE  (/work/*  role=EMPLOYEE|MANAGER|ADMIN)
/work                     Today: clock in/out, my students, targets
/work/students            My assigned students → /work/students/[studentId]
/work/students/[id]/apply New application workspace (JD → tailored resume → log)
/work/applications        All applications I logged (filters, bulk status)
/work/interviews          Interviews for my students
/work/messages            All my student threads
/work/timesheet           My sessions, hours, login history
/work/leave               My leave requests + apply
/work/profile

ADMIN  (/admin/*  role=ADMIN, some MANAGER)
/admin                    Overview dashboard
/admin/students           → /admin/students/[id] (360° view)
/admin/employees          → /admin/employees/[id] (performance, attendance, assignments)
/admin/assignments        Queue (awaiting assignment) + reassign + rules
/admin/applications       All applications, all students
/admin/attendance         Daily attendance board + timesheets + export
/admin/leave              Requests to approve, leave calendar, holidays
/admin/plans              Plans × markets × intervals, targets
/admin/coupons
/admin/payments           Payments, refunds, invoices
/admin/markets            Countries: currency, tz, gateway, resume style
/admin/resume-styles      Country style rules + templates
/admin/prep               Interview prep resources + mock interview slots
/admin/leads              Contact form, chatbot, call bookings
/admin/cms                Pages, blog, success stories, FAQ, landing pages, legal
/admin/reports            Revenue, delivery, staff performance, retention
/admin/audit-log
/admin/settings           Business details, notification templates, AI limits, auto-assign toggle
```

**Middleware:** `middleware.ts` protects `/app`, `/work` and `/admin` by role. Unauthenticated users are redirected to `/login?next=…`. A wrong role gets a 403 page. A student who hasn't finished onboarding is redirected to `/app/onboarding`. A student with no active subscription sees the dashboard read-only with a "Renew" banner.

---

## 6. Public website (pre-sales)

### 6.1 Global requirements
- **Mobile first.** Design at 375px first, then 768px and 1280px+. No horizontal scroll anywhere. Tap targets ≥ 44px.
- **Performance:** LCP < 2.0s on 4G, CLS < 0.05, JS on marketing pages < 120 KB gzipped. Use `next/image`, `next/font` and static generation with ISR (revalidate 1 hour, plus on-demand revalidation when CMS content is saved).
- **SEO on every page:** unique `<title>` (≤ 60 chars) and meta description (≤ 155 chars) from `generateMetadata`; canonical URL; Open Graph and Twitter cards with a generated OG image (`opengraph-image.tsx`); JSON-LD (Organization site-wide; Service + Offer on pricing; FAQPage on FAQ and pricing; Article on blog; Review on success stories); `sitemap.ts` covering all CMS pages; `robots.ts`; one H1 per page; alt text required by the CMS for every image.
- **Market detection:** read the `x-vercel-ip-country` header, store the result in a `market` cookie, and show a market switcher in the header. Country decides currency, plans shown, phone/WhatsApp number and hero copy variant.
- **Tracking:** GA4 + Clarity, loaded after consent (cookie banner with Accept / Reject non-essential). Fire events: `cta_book_call`, `cta_get_started`, `pricing_view`, `plan_selected`, `checkout_started`, `signup_completed`, `payment_succeeded`, `contact_submitted`.
- **Header:** logo, How it works, Pricing, Success stories, About, Blog, Log in, primary CTA "Get started". Mobile: hamburger sheet.
- **Footer:** short about, links, legal links, market switcher, contact per market, social links (plain URLs), "© UpayaInd". No payment logos labelled "Trusted by".

### 6.2 Homepage sections (in order)
1. **Hero.** H1: "You'll never apply to a job again." Sub: "Our specialists apply to 25–50 jobs for you every weekday, each with a resume tailored to the job. Track every application live." CTAs: "Get started" → /pricing and "See how it works" → /how-it-works. Visual: a real screenshot or animated mock of the student dashboard (no AI-generated people).
2. **Proof strip.** Verified counters from the DB (students served, applications sent, interviews landed), auto-updated daily. Show only numbers the platform actually computed. Logos of companies students were hired at come from the CMS (success stories).
3. **Problem → solution.** DIY vs UpayaInd comparison (hours per week, applications per month, tailored vs generic resume).
4. **How it works.** 4 steps with a timeline: Day 1 sign up & onboarding → Day 2 master resume ready → Daily tailored applications → You interview, we keep going.
5. **Dashboard demo.** An interactive, static-data replica of `/app` with fake data and a "Demo" badge.
6. **Tailored resume showcase.** Before/after: the same profile tailored to two different JDs, with keyword highlights.
7. **Success stories.** 3 cards from the CMS (photo, name, role, company, weeks to offer, applications sent, quote).
8. **Who it's for.** Cards linking to `/for/[audience]`.
9. **Pricing preview.** Plans for the detected market, with the middle plan highlighted, linking to /pricing.
10. **Interview prep and training.** What students get beyond applications.
11. **FAQ.** 6–8 items from the CMS, with FAQPage schema.
12. **Final CTA band.**

### 6.3 Pricing page
- Plans for the current market from the DB (`Plan` + `PlanPrice`). Interval toggle shows only the intervals that exist for that market. Show the saving % for longer intervals, computed against the monthly price.
- Each card shows: name, price, interval, **daily application target** (from DB), feature list (from DB, ordered), and a "Most popular" badge (`isFeatured`).
- Comparison table + pricing FAQ + guarantee summary linking to `/legal/guarantee`.
- "Choose plan" → `/signup?plan=<planPriceId>` (or straight to checkout if already logged in as a student). **No login wall before choosing a plan.**
- **Guard:** admin cannot publish a PlanPrice below `market.minPrice` (validation + DB check constraint).

### 6.4 Other pages
- **How it works:** detailed timeline, what we need from you (resume, preferences, portal access), what you'll see daily, tailored resume explanation, ethics & consent FAQ.
- **Success stories:** CMS list + detail page (story, stats, quote, optional video embed).
- **About:** mission, founder note, team grid (from CMS: photo, name, role, LinkedIn).
- **Contact:** form (name, email, phone with country code, market, message min 10 chars, consent checkbox) → creates a `Lead` and sends an auto-reply email. Cal.com embed for "Book a free call". WhatsApp click-to-chat per market.
- **Legal:** Privacy, Terms, Refund, Guarantee and Cookies, each editable in the CMS. Must exist before launch. The signup checkbox links to Terms and Privacy.
- **Blog & landing pages:** CMS-driven with SEO fields (title, description, slug, OG image, canonical, noindex toggle).

---

## 7. Core flows (step by step)

### F1. Student sign-up → payment → assignment
1. `/signup`: fields are full name, email, password (min 10 chars, zxcvbn score ≥ 2), phone (E.164 via `libphonenumber-js`), **market** (country, pre-filled from geo), and consent checkboxes (Terms + Privacy; "I authorise UpayaInd to apply to jobs on my behalf"). Google sign-up is also available (then ask phone + market + consents).
2. Send an email verification link (valid 24h). The user can continue to checkout but must verify before onboarding completes.
3. **Checkout:** create a Stripe Checkout Session (mode `subscription` for recurring intervals; Price IDs stored on `PlanPrice.providerPriceId`). Success URL is `/app/onboarding?paid=1`.
4. **Webhook** `/api/webhooks/stripe` (verify signature; idempotent on `event.id`):
   - `checkout.session.completed` / `invoice.paid` → upsert `Subscription` (status `ACTIVE`, `currentPeriodStart/End`), create `Payment`, then emit Inngest event `subscription.activated`.
   - `invoice.payment_failed` → status `PAST_DUE` + email. `customer.subscription.deleted` → `CANCELED`.
   - **Only the webhook activates a subscription.** Never activate from the success redirect.
5. Inngest `subscription.activated` → run **auto-assignment** (F2) → notify the student ("Your specialist is Arjun") and the employee ("New student assigned").
6. Until assignment exists, the student dashboard shows the state **"We're assigning your specialist. Usually within a few hours."**

### F2. Auto-assignment algorithm
Triggered by `subscription.activated`, by an admin clicking "Auto-assign", or when an employee is deactivated (re-home all their students).

```
candidates = employees where
    user.status = ACTIVE
    and employee.acceptingNewStudents = true
    and student.marketId ∈ employee.marketIds
    and not on approved leave today
    and activeAssignmentsCount < employee.maxStudents
if none → assignment status AWAITING, create admin alert + email to managers, stop.
pick candidate with:
    1) fewest active assignments
    2) tie → fewest assignments created in last 7 days
    3) tie → oldest lastAssignedAt
    4) tie → random
create Assignment(active=true, source=AUTO), set employee.lastAssignedAt = now
write AssignmentEvent + AuditLog
```

- Wrap this in a DB transaction with `SELECT … FOR UPDATE` on the employee rows so that two payments at the same moment can't overfill one employee.
- Setting `settings.autoAssignEnabled`: when false, every new student goes to the AWAITING queue.
- **Manual reassign** (Admin/Manager): pick a new employee (dropdown shows current load/max) and a reason. The old assignment closes (`endedAt`, `endReason`) and the new one opens. The student and both employees are notified. **All history stays**, and applications keep their original `employeeId`.
- **Temporary cover during leave:** when leave is approved, the manager can set a cover employee for the leave dates (`Assignment` with `type=COVER`, `startsAt/endsAt`). The cover employee gets access only for that window.

### F3. Student onboarding wizard (`/app/onboarding`)
The steps are saved after each one and can be resumed.
1. **Upload current resume** (PDF/DOCX ≤ 5 MB). Inngest job `resume.parse`: extract text (`pdf-parse` / `mammoth`) → Claude converts it to master profile JSON (Section 9.2) → the student reviews and edits the structured profile.
2. **Job preferences:** target job titles (up to 5), seniority, industries, locations (multi, with "Remote OK"), work mode (onsite/hybrid/remote), employment type (full-time/contract/internship), minimum salary + currency, work authorization / visa status (US: Citizen, Green Card, H1B, H4 EAD, OPT, STEM OPT, CPT, Needs sponsorship), willing to relocate, notice period, companies to avoid (list), companies to target (list).
3. **Credential vault** (Section 10): the email account used for applications, plus job portals (LinkedIn, Indeed, Dice, Glassdoor, ZipRecruiter, Handshake, Other). For each: username, password, notes (e.g. 2FA instructions).
4. **Links:** LinkedIn URL, GitHub, portfolio.
5. **Review & consent:** confirm authorisation to apply on their behalf.
On completion: `studentProfile.onboardingCompletedAt = now`. Notify the assigned employee: "Onboarding complete. Start applying."

### F4. Employee daily work: the application workspace (most important screen)
Route: `/work/students/[id]/apply`. Layout is two-pane on desktop and stacked on mobile.

**Left pane (input):**
1. Job URL (required; normalised: strip tracking params, lowercase host).
2. Company name (required, autocomplete from previous companies).
3. Job title (required).
4. Location (text) + work mode + employment type.
5. Source (LinkedIn, Indeed, Company site, Dice, Glassdoor, Referral, Other).
6. **Paste job description** (required, 200–20,000 chars).
7. Button **"Generate tailored resume"**.

**Duplicate check (runs on URL/company/title blur):**
- Same normalised job URL for this student → **block** ("Already applied on 3 Oct by Arjun").
- Same company + title similarity ≥ 0.85 (trigram, `pg_trgm`) within 60 days → **warning** that the employee must confirm.
- Company is in the student's "avoid" list → **block**.

**Generation (Inngest `resume.tailor`, streamed progress to UI):**
1. JD analysis → JSON: required skills, nice-to-have skills, keywords, seniority, responsibilities summary. Cache by `sha256(jd)`.
2. Tailoring → resume JSON (same schema as the master profile, subset/reordered), following the **market resume style** (Section 9.3) and the **truthfulness rules** (Section 9.4).
3. Compute an **ATS match score** (0–100) for the base resume vs the tailored resume: JD keyword coverage (exact + stemmed), title alignment and skills overlap. Show both: "Base 54 → Tailored 86".
4. Render the PDF (and DOCX on demand) with the student's chosen template.

**Right pane (output):**
- Live preview of the tailored resume (PDF viewer).
- **Structured editor** (sections, bullets drag-sort, inline edit). Every edit re-renders the preview within 1 second (debounced).
- Keyword panel: JD keywords covered ✅ / missing ⚠️ (missing ones are suggestions only; never auto-insert skills the student doesn't have).
- Optional **cover letter** generation (same truthfulness rules; ≤ 250 words; editable).
- Buttons: **Download PDF**, **Download DOCX**, **Copy cover letter**.

**Logging the application:**
- After applying externally (with the student's email or portal account), the employee clicks **"Mark as applied"**. This creates a `JobApplication` with status `APPLIED`, `appliedAt = now`, and links the **immutable** `ResumeVersion` (snapshot JSON + PDF/DOCX file keys), the cover letter, JD text and metadata.
- Optional proof upload: a screenshot of the confirmation (PNG/JPG ≤ 3 MB) or paste a confirmation email text.
- The counter "Today: 18 / 25 for Priya" updates instantly.
- Keyboard shortcuts: `⌘/Ctrl+Enter` = generate, `⌘/Ctrl+S` = mark applied, `N` = new application.

**Other ways to log** (same duplicate rules):
- **Quick log without AI** (applied with the base resume or a reused version: pick it from a dropdown).
- **Bulk import** (CSV: job_url, company, title, location, source, applied_at, resume_version_id optional) with a preview and error rows.

**Applying to the same JD for several students** is not allowed in one action. Each student gets their own generation, because the tailoring is per profile.

### F5. Application status lifecycle
Statuses (enum `ApplicationStatus`):
`DRAFT → APPLIED → VIEWED → RECRUITER_REPLIED → ASSESSMENT → INTERVIEW_SCHEDULED → INTERVIEWING → OFFER → HIRED`
plus terminal states `REJECTED`, `NO_RESPONSE` (auto after 30 days in APPLIED/VIEWED, via a nightly job), `WITHDRAWN`, `ON_HOLD`.

- Every change creates an `ApplicationEvent` (from, to, by, note, at). The timeline is shown on the application detail page.
- `INTERVIEW_SCHEDULED` requires an `Interview` record: date/time + timezone, round (Recruiter screen, Technical, Hiring manager, Panel, HR, Final, Other), mode (Phone/Video/Onsite), meeting link, interviewer names, prep notes.
- The student can **report** "I got an interview / offer" from their side. This sets the status and notifies the employee to verify.
- `OFFER`/`HIRED` triggers the celebration UI for the student, a testimonial request email 7 days later, and a notification to admin.
- **Mock interviews:** a separate entity `MockInterview` (scheduled by employee/trainer, with status SCHEDULED/DONE/NO_SHOW and a feedback scorecard). The student sees them in `/app/prep`.

### F6. Student tracking (`/app`)
- **Top cards:** Applied today (vs daily target, progress bar) · This week · Total · Interviews (upcoming) · Response rate (% of applications beyond APPLIED/VIEWED/NO_RESPONSE).
- **Chart:** applications per day over the last 30 days (bar) with the target line.
- **Latest applications** list: company logo (Clearbit-style favicon fallback), title, location, applied date/time (student's tz), status pill, **"Resume used"** (view/download), job link.
- **Upcoming interviews** with add-to-calendar (.ics).
- **Plan card:** plan, day X of Y, renewal date, assigned specialist with avatar and a "Message" button.
- `/app/applications`: table with search, filters (status, date range, company, source, work mode) and CSV export. The detail page shows the JD, tailored resume (PDF preview), cover letter, proof, status timeline and interview(s).
- `/app/resumes`: master profile + base resume + every tailored version (grouped by job), each downloadable.

### F7. Messaging
- One thread per (student, active employee). When reassigned, a new thread starts. Old threads stay read-only and visible to the student.
- Messages hold text (markdown-lite), attachments (≤ 10 MB; PDF/DOC/DOCX/PNG/JPG) and optional links to an application (shown as a card).
- Unread counts; read receipts (`readAt`).
- Delivery: poll every 15s when the thread is open (React Query `refetchInterval`) + an email notification if the message is unread after 10 minutes (Inngest delayed job). No WebSocket at launch.
- Admin/Manager can view all threads (read-only) for quality control. This is disclosed in the Privacy Policy.
- Employees can send a **broadcast** to all their assigned students (e.g. holiday notice). It creates individual messages.

### F8. Attendance and time tracking (employees)
- **Login history:** every successful login records `LoginEvent` (userId, at, ip, userAgent, success). Failed logins are recorded too.
- **Clock in / clock out:** a prominent button on `/work`. Clock-in creates a `WorkSession(startedAt)`. Clock-out sets `endedAt`. Only one open session is allowed. If the employee forgets, the nightly job auto-closes the session at the last activity ping + 5 min and flags `autoClosed=true`.
- **Breaks:** "Start break / End break" creates `BreakPeriod` rows inside the session.
- **Activity pings:** while the `/work` tab is visible and the user interacted in the last 5 minutes (mouse/keyboard/scroll), the client sends a heartbeat every 60s → `ActivityMinute` (userId, minute bucket). Gives **active minutes** separately from clocked time.
- **Daily summary** (computed by a nightly job and also live for today): first login, clock-in, clock-out, total clocked time, break time, active minutes, applications logged, statuses updated, messages sent. Stored in `EmployeeDay`.
- **Attendance status per day:** PRESENT (clocked ≥ 4h), HALF_DAY (2–4h), ABSENT (no session, no approved leave, a working day), ON_LEAVE, HOLIDAY, WEEKEND. Working days and hours per employee come from their `WorkSchedule` (default Mon–Fri, 9 hours, employee's timezone).
- Employee view `/work/timesheet`: calendar + list, totals per week/month.
- Admin view `/admin/attendance`: today's board (who's clocked in, active now, idle > 15 min, not yet in), date-range timesheets, CSV/XLSX export, and manual correction with a reason (audit-logged).

### F9. Leave management
- Leave types (configurable by admin): Casual, Sick, Earned/Paid, Unpaid, Comp-off. Each has an annual quota per employee and can carry forward or not.
- Apply: type, from/to date, half-day (first/second half) option, reason, attachment (optional). Show remaining balance. Block overlapping requests.
- Manager/Admin approves or rejects with a comment. Notify by email + in-app.
- Approved leave marks those days ON_LEAVE, excludes the employee from auto-assignment for those dates, and prompts the manager to set **cover** (F2).
- **Holidays:** a holiday calendar per office/market (admin-managed). Holidays aren't counted as working days.
- Leave calendar view for managers (who's out this week).

### F10. Daily targets and performance
- `PlanPrice.dailyTarget` (e.g. 25). Target days follow the **student's market working days** (Mon–Fri by default; configurable per market). The "day" boundary uses the **employee's timezone** (so an IST employee's working day maps cleanly).
- `StudentDay` (nightly + live): applications logged vs target, by employee.
- Employee dashboard `/work`: a card per assigned student with today's progress bar, the last application time, and red/amber/green status (green ≥ 100% of the pro-rated target for the time of day, amber 60–99%, red < 60%).
- Manager alert at a configurable time (default 3pm employee tz): list of students below 50% of target.
- Performance report per employee: applications per day, % target met, response rate, interviews generated, avg generation-to-log time, active hours.

### F11. Subscription lifecycle and renewals
- Statuses: `PENDING_PAYMENT, ACTIVE, PAST_DUE, PAUSED, CANCELED, EXPIRED`.
- Reminders at T-7 and T-2 days (email + in-app). Stripe handles auto-renew for recurring plans. One-time plans become EXPIRED at period end.
- When not ACTIVE, the student's targets stop, the employee sees the student as "Inactive" (greyed out, no new applications allowed), and data stays visible to the student.
- **Pause** (admin only, P1): freeze targets and extend the period end by the paused days.
- Upgrade/downgrade via the Stripe customer portal, which syncs through webhooks.

### F12. Interview prep and training
- `/admin/prep`: resources (title, type VIDEO/ARTICLE/PDF/QUESTION_BANK/LINK, tags: role family, market, level; file or URL; Tiptap body).
- `/app/prep`: the library filtered by the student's target roles, a "Recommended for your upcoming interview" block (matches tags with the interview's job title), and mock interview bookings (slots published by employees/trainers).
- Mock interview feedback scorecard: communication, technical, structure, confidence (1–5) + notes. Visible to the student.

### F13. Notifications
Use one `notify(userId, type, payload)` service. It writes an in-app `Notification` (bell icon with unread count) and sends email via Resend when the user's preferences allow. WhatsApp is added in P1 through the same interface.

| Event | Student | Employee | Admin/Manager |
|---|---|---|---|
| Signup / verify email | ✅ email | | |
| Payment succeeded / failed | ✅ | | ✅ (failed) |
| Assigned / reassigned | ✅ | ✅ | ✅ if AWAITING |
| Onboarding completed | | ✅ | |
| Daily digest (applications today, 7pm student tz) | ✅ | | |
| Status → interview/offer | ✅ instant | ✅ | ✅ (offer) |
| New message (unread 10 min) | ✅ | ✅ | |
| Weekly report (Monday 9am student tz, PDF attached) | ✅ | | summary |
| Renewal reminders | ✅ | ✅ (student expiring) | |
| Leave request / decision | | ✅ | ✅ |
| Student below target at 3pm | | ✅ | ✅ |
| New lead | | | ✅ |

---

## 8. Data model (Prisma)

Use this as the starting `prisma/schema.prisma`. Store all timestamps in UTC. Money is stored as **integer minor units** (cents/paise) with a currency code. Use soft delete (`deletedAt`) for users, students, employees, plans, and CMS records. **Never hard-delete payments, applications or audit logs.**

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL"); extensions = [pg_trgm] }

enum Role { STUDENT EMPLOYEE MANAGER ADMIN }
enum UserStatus { ACTIVE INVITED SUSPENDED DEACTIVATED }
enum SubscriptionStatus { PENDING_PAYMENT ACTIVE PAST_DUE PAUSED CANCELED EXPIRED }
enum BillingInterval { MONTHLY QUARTERLY HALF_YEARLY YEARLY ONE_TIME }
enum PaymentStatus { PENDING SUCCEEDED FAILED REFUNDED PARTIALLY_REFUNDED }
enum AssignmentType { PRIMARY COVER }
enum AssignmentSource { AUTO MANUAL }
enum ApplicationStatus { DRAFT APPLIED VIEWED RECRUITER_REPLIED ASSESSMENT INTERVIEW_SCHEDULED INTERVIEWING OFFER HIRED REJECTED NO_RESPONSE WITHDRAWN ON_HOLD }
enum WorkMode { ONSITE HYBRID REMOTE }
enum EmploymentType { FULL_TIME PART_TIME CONTRACT INTERNSHIP TEMPORARY }
enum JobSource { LINKEDIN INDEED DICE GLASSDOOR ZIPRECRUITER COMPANY_SITE HANDSHAKE REFERRAL OTHER }
enum LeaveStatus { PENDING APPROVED REJECTED CANCELLED }
enum AttendanceStatus { PRESENT HALF_DAY ABSENT ON_LEAVE HOLIDAY WEEKEND }
enum ResumeKind { MASTER_UPLOAD BASE TAILORED }

model User {
  id             String     @id @default(cuid())
  email          String     @unique
  emailVerified  DateTime?
  passwordHash   String?
  name           String
  phone          String?
  avatarKey      String?
  role           Role
  status         UserStatus @default(ACTIVE)
  timezone       String     @default("America/New_York")
  locale         String     @default("en")
  totpSecretEnc  String?    // encrypted; required for EMPLOYEE/MANAGER/ADMIN
  totpEnabled    Boolean    @default(false)
  lastLoginAt    DateTime?
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
  deletedAt      DateTime?
  student        StudentProfile?
  employee       EmployeeProfile?
  accounts       Account[]          // Auth.js OAuth
  loginEvents    LoginEvent[]
  notifications  Notification[]
  notificationPrefs Json?
}

model Account { /* standard Auth.js adapter model */ id String @id @default(cuid()) userId String provider String providerAccountId String type String access_token String? refresh_token String? expires_at Int? token_type String? scope String? id_token String? user User @relation(fields:[userId], references:[id]) @@unique([provider, providerAccountId]) }

model Market {
  id              String  @id @default(cuid())
  code            String  @unique        // "US", "UK", "IN", "CA", "AU", "DE"
  name            String
  currency        String                 // ISO 4217 "USD"
  minPriceMinor   Int                    // price floor guard
  defaultTimezone String
  workingDays     Int[]   @default([1,2,3,4,5]) // ISO weekday
  paymentProvider String  @default("STRIPE")    // STRIPE | RAZORPAY
  phoneDisplay    String?
  whatsapp        String?
  isActive        Boolean @default(true)
  resumeStyleId   String
  resumeStyle     ResumeStyle @relation(fields:[resumeStyleId], references:[id])
  plans           PlanPrice[]
}

model ResumeStyle {
  id            String @id @default(cuid())
  code          String @unique   // "US_RESUME", "UK_CV", "IN_RESUME", "DE_LEBENSLAUF"...
  name          String
  documentTitle String           // "Resume" | "CV" | "Curriculum Vitae"
  pageSize      String           // "LETTER" | "A4"
  maxPages      Int
  dateFormat    String           // "MMM yyyy" | "MM/yyyy"
  spelling      String           // "en-US" | "en-GB"
  includePhoto  Boolean
  includeDob    Boolean
  includeNationality Boolean
  includeFullAddress Boolean
  summaryLabel  String           // "Summary" | "Personal Statement" | "Profile"
  sectionOrder  String[]         // e.g. ["summary","skills","experience","projects","education","certifications"]
  rulesPrompt   String           // extra instructions injected into AI prompt
  markets       Market[]
}

model ResumeTemplate {
  id        String  @id @default(cuid())
  code      String  @unique      // "classic", "modern", "compact"
  name      String
  isActive  Boolean @default(true)
}

model Plan {
  id          String  @id @default(cuid())
  code        String  @unique     // "basic","standard","premium"
  name        String
  description String?
  features    String[]            // ordered bullet list (display)
  isFeatured  Boolean @default(false)
  sortOrder   Int     @default(0)
  isActive    Boolean @default(true)
  deletedAt   DateTime?
  prices      PlanPrice[]
}

model PlanPrice {
  id              String          @id @default(cuid())
  planId          String
  marketId        String
  interval        BillingInterval
  amountMinor     Int
  currency        String
  dailyTarget     Int             // applications per working day
  interviewsPromise String?       // marketing text e.g. "2–4 per month"
  providerPriceId String?         // Stripe price id
  isActive        Boolean         @default(true)
  plan            Plan   @relation(fields:[planId], references:[id])
  market          Market @relation(fields:[marketId], references:[id])
  @@unique([planId, marketId, interval])
}

model Coupon { id String @id @default(cuid()) code String @unique percentOff Int? amountOffMinor Int? currency String? maxRedemptions Int? redeemed Int @default(0) validFrom DateTime? validTo DateTime? planPriceIds String[] providerCouponId String? isActive Boolean @default(true) }

model StudentProfile {
  id                    String   @id @default(cuid())
  userId                String   @unique
  marketId              String
  onboardingStep        Int      @default(0)
  onboardingCompletedAt DateTime?
  linkedinUrl           String?
  githubUrl             String?
  portfolioUrl          String?
  workAuthorization     String?   // market-specific enum value
  needsSponsorship      Boolean  @default(false)
  targetTitles          String[]
  seniority             String?
  industries            String[]
  locations             String[]
  remoteOk              Boolean  @default(true)
  workModes             WorkMode[]
  employmentTypes       EmploymentType[]
  minSalaryMinor        Int?
  salaryCurrency        String?
  willingToRelocate     Boolean  @default(false)
  noticePeriod          String?
  avoidCompanies        String[]
  targetCompanies       String[]
  masterProfile         Json?     // Section 9.2 schema
  templateId            String?   // preferred resume template
  consentApplyOnBehalfAt DateTime?
  consentTermsAt        DateTime?
  user                  User     @relation(fields:[userId], references:[id])
  market                Market   @relation(fields:[marketId], references:[id])
  subscriptions         Subscription[]
  assignments           Assignment[]
  applications          JobApplication[]
  resumes               ResumeVersion[]
  credentials           Credential[]
}

model EmployeeProfile {
  id                    String   @id @default(cuid())
  userId                String   @unique
  employeeCode          String   @unique     // e.g. UPY-0012
  title                 String?               // "Job Application Specialist"
  marketIds             String[]              // markets they can serve
  maxStudents           Int      @default(8)
  acceptingNewStudents  Boolean  @default(true)
  lastAssignedAt        DateTime?
  joiningDate           DateTime?
  managerId             String?
  workSchedule          Json     // {days:[1..5], startTime:"09:30", hours:9}
  user                  User     @relation(fields:[userId], references:[id])
  assignments           Assignment[]
  sessions              WorkSession[]
  leaves                LeaveRequest[]
}

model Subscription {
  id                  String   @id @default(cuid())
  studentId           String
  planPriceId         String
  status              SubscriptionStatus
  provider            String               // STRIPE | RAZORPAY | MANUAL
  providerSubId       String?  @unique
  providerCustomerId  String?
  currentPeriodStart  DateTime?
  currentPeriodEnd    DateTime?
  cancelAtPeriodEnd   Boolean  @default(false)
  pausedDays          Int      @default(0)
  createdAt           DateTime @default(now())
  student             StudentProfile @relation(fields:[studentId], references:[id])
  payments            Payment[]
}

model Payment {
  id               String        @id @default(cuid())
  subscriptionId   String?
  studentId        String
  amountMinor      Int
  currency         String
  status           PaymentStatus
  provider         String
  providerPaymentId String?      @unique
  invoiceNumber    String?       @unique   // UPY-2026-000123
  invoiceKey       String?                // PDF in R2
  taxMinor         Int           @default(0)
  refundedMinor    Int           @default(0)
  failureReason    String?
  paidAt           DateTime?
  createdAt        DateTime      @default(now())
  subscription     Subscription? @relation(fields:[subscriptionId], references:[id])
}

model WebhookEvent { id String @id provider String type String receivedAt DateTime @default(now()) processedAt DateTime? payload Json }

model Assignment {
  id          String           @id @default(cuid())
  studentId   String
  employeeId  String
  type        AssignmentType   @default(PRIMARY)
  source      AssignmentSource
  isActive    Boolean          @default(true)
  startsAt    DateTime         @default(now())
  endsAt      DateTime?
  endReason   String?
  createdById String?
  student     StudentProfile   @relation(fields:[studentId], references:[id])
  employee    EmployeeProfile  @relation(fields:[employeeId], references:[id])
  @@index([employeeId, isActive])
  @@index([studentId, isActive])
}
// DB constraint: at most one active PRIMARY assignment per student (partial unique index in migration SQL)

model Credential {
  id            String   @id @default(cuid())
  studentId     String
  kind          String              // EMAIL | LINKEDIN | INDEED | DICE | GLASSDOOR | ZIPRECRUITER | HANDSHAKE | OTHER
  label         String
  loginUrl      String?
  usernameEnc   String              // AES-256-GCM envelope encrypted
  passwordEnc   String
  notesEnc      String?
  updatedAt     DateTime @updatedAt
  student       StudentProfile @relation(fields:[studentId], references:[id])
  accessLogs    CredentialAccessLog[]
}
model CredentialAccessLog { id String @id @default(cuid()) credentialId String userId String action String at DateTime @default(now()) ip String? credential Credential @relation(fields:[credentialId], references:[id]) }

model ResumeVersion {
  id             String     @id @default(cuid())
  studentId      String
  kind           ResumeKind
  title          String               // "Base resume" | "Data Analyst – Deloitte"
  content        Json                 // resume JSON (Section 9.2), immutable after use
  styleCode      String
  templateCode   String
  pdfKey         String?
  docxKey        String?
  originalFileKey String?             // for MASTER_UPLOAD
  jdAnalysis     Json?
  atsScoreBase   Int?
  atsScore       Int?
  createdById    String
  lockedAt       DateTime?            // set when attached to an application
  createdAt      DateTime   @default(now())
  student        StudentProfile @relation(fields:[studentId], references:[id])
}

model JobApplication {
  id               String            @id @default(cuid())
  studentId        String
  employeeId       String            // who applied
  companyName      String
  companyDomain    String?
  jobTitle         String
  jobUrl           String
  jobUrlNormalized String
  location         String?
  workMode         WorkMode?
  employmentType   EmploymentType?
  source           JobSource
  jdText           String?
  salaryText       String?
  status           ApplicationStatus @default(APPLIED)
  appliedAt        DateTime?
  resumeVersionId  String?
  coverLetter      String?
  proofKey         String?
  proofText        String?
  notes            String?
  lastStatusAt     DateTime          @default(now())
  createdAt        DateTime          @default(now())
  student          StudentProfile    @relation(fields:[studentId], references:[id])
  events           ApplicationEvent[]
  interviews       Interview[]
  @@unique([studentId, jobUrlNormalized])
  @@index([employeeId, appliedAt])
  @@index([studentId, appliedAt])
}
model ApplicationEvent { id String @id @default(cuid()) applicationId String fromStatus ApplicationStatus? toStatus ApplicationStatus note String? byUserId String at DateTime @default(now()) application JobApplication @relation(fields:[applicationId], references:[id]) }
model Interview { id String @id @default(cuid()) applicationId String scheduledAt DateTime timezone String round String mode String meetingLink String? interviewers String? prepNotes String? outcome String? application JobApplication @relation(fields:[applicationId], references:[id]) }
model MockInterview { id String @id @default(cuid()) studentId String conductedById String scheduledAt DateTime status String focus String? scores Json? feedback String? }

model MessageThread { id String @id @default(cuid()) studentId String employeeId String isActive Boolean @default(true) createdAt DateTime @default(now()) messages Message[] @@unique([studentId, employeeId]) }
model Message { id String @id @default(cuid()) threadId String senderId String body String attachmentKeys String[] applicationId String? readAt DateTime? createdAt DateTime @default(now()) thread MessageThread @relation(fields:[threadId], references:[id]) @@index([threadId, createdAt]) }

model LoginEvent { id String @id @default(cuid()) userId String at DateTime @default(now()) ip String? userAgent String? success Boolean user User @relation(fields:[userId], references:[id]) }
model WorkSession { id String @id @default(cuid()) employeeId String startedAt DateTime endedAt DateTime? autoClosed Boolean @default(false) correctedById String? correctionNote String? employee EmployeeProfile @relation(fields:[employeeId], references:[id]) breaks BreakPeriod[] }
model BreakPeriod { id String @id @default(cuid()) sessionId String startedAt DateTime endedAt DateTime? session WorkSession @relation(fields:[sessionId], references:[id]) }
model ActivityMinute { userId String minute DateTime @@id([userId, minute]) }
model EmployeeDay { id String @id @default(cuid()) employeeId String date DateTime @db.Date status AttendanceStatus firstLoginAt DateTime? clockInAt DateTime? clockOutAt DateTime? clockedMinutes Int @default(0) breakMinutes Int @default(0) activeMinutes Int @default(0) applications Int @default(0) statusUpdates Int @default(0) messagesSent Int @default(0) @@unique([employeeId, date]) }
model StudentDay { id String @id @default(cuid()) studentId String date DateTime @db.Date target Int applied Int @default(0) @@unique([studentId, date]) }

model LeaveType { id String @id @default(cuid()) name String annualQuota Float paid Boolean @default(true) carryForward Boolean @default(false) isActive Boolean @default(true) }
model LeaveRequest { id String @id @default(cuid()) employeeId String leaveTypeId String fromDate DateTime @db.Date toDate DateTime @db.Date halfDay String? days Float reason String attachmentKey String? status LeaveStatus @default(PENDING) decidedById String? decidedAt DateTime? decisionNote String? createdAt DateTime @default(now()) employee EmployeeProfile @relation(fields:[employeeId], references:[id]) }
model Holiday { id String @id @default(cuid()) date DateTime @db.Date name String region String }   // region = office/market code

model Notification { id String @id @default(cuid()) userId String type String title String body String link String? readAt DateTime? createdAt DateTime @default(now()) user User @relation(fields:[userId], references:[id]) @@index([userId, readAt]) }

model PrepResource { id String @id @default(cuid()) title String type String tags String[] marketCodes String[] url String? fileKey String? body Json? isPublished Boolean @default(false) createdAt DateTime @default(now()) }

model Lead { id String @id @default(cuid()) name String email String phone String? marketCode String? source String message String? status String @default("NEW") ownerId String? nextFollowUpAt DateTime? utm Json? createdAt DateTime @default(now()) }

model CmsEntry { id String @id @default(cuid()) kind String slug String title String excerpt String? body Json bodyHtml String seoTitle String? seoDescription String? ogImageKey String? data Json? isPublished Boolean @default(false) publishedAt DateTime? updatedAt DateTime @updatedAt deletedAt DateTime? @@unique([kind, slug]) }
// kind: PAGE | LEGAL | BLOG | STORY | FAQ | TEAM | LANDING

model FileObject { id String @id @default(cuid()) key String @unique ownerUserId String purpose String mime String size Int createdAt DateTime @default(now()) }
model AiUsage { id String @id @default(cuid()) userId String studentId String? task String model String inputTokens Int outputTokens Int costMicros Int createdAt DateTime @default(now()) }
model AuditLog { id String @id @default(cuid()) actorId String? action String entity String entityId String? before Json? after Json? ip String? at DateTime @default(now()) @@index([entity, entityId]) }
model Setting { key String @id value Json }
```

**Required migration SQL extras**
- `CREATE EXTENSION IF NOT EXISTS pg_trgm;` plus a GIN trigram index on `JobApplication(companyName, jobTitle)`.
- A partial unique index: one active PRIMARY assignment per student: `CREATE UNIQUE INDEX one_primary_active ON "Assignment"("studentId") WHERE "isActive" AND "type"='PRIMARY';`
- Check constraint `amountMinor >= 0` on PlanPrice. The price floor is enforced in the app against `Market.minPriceMinor`.

---

## 9. Resume engine (the core differentiator)

### 9.1 Pipeline
```
Upload (PDF/DOCX) ─► text extract ─► Claude: parse → MasterProfile JSON ─► student reviews
MasterProfile + MarketStyle + Template ─► BASE resume (JSON → PDF/DOCX)
JD + company + title ─► Claude: JD analysis (cached) ─► Claude: tailor → resume JSON
     ─► validator (truthfulness + schema + length) ─► ATS score ─► render PDF/DOCX ─► employee edits ─► lock on "Mark as applied"
```

### 9.2 Resume JSON schema (zod; used for master profile AND every version)
```ts
const ResumeJSON = z.object({
  basics: z.object({
    name: z.string(), headline: z.string().optional(),
    email: z.string().email(), phone: z.string(),
    location: z.object({ city: z.string(), region: z.string().optional(), country: z.string() }),
    links: z.array(z.object({ label: z.string(), url: z.string().url() })).default([]),
    photoKey: z.string().optional(),                 // only rendered if style.includePhoto
    dateOfBirth: z.string().optional(),              // only if style.includeDob
    nationality: z.string().optional(),
    workAuthorization: z.string().optional(),
  }),
  summary: z.string().max(800).optional(),
  skills: z.array(z.object({ group: z.string(), items: z.array(z.string()) })),
  experience: z.array(z.object({
    id: z.string(), company: z.string(), title: z.string(), location: z.string().optional(),
    startDate: z.string(), endDate: z.string().nullable(), // ISO yyyy-mm; null = present
    bullets: z.array(z.object({ id: z.string(), text: z.string() })),
    technologies: z.array(z.string()).default([]),
  })),
  projects: z.array(z.object({ id: z.string(), name: z.string(), description: z.string(), bullets: z.array(z.string()), link: z.string().optional() })).default([]),
  education: z.array(z.object({ id: z.string(), institution: z.string(), degree: z.string(), field: z.string().optional(), startDate: z.string().optional(), endDate: z.string().optional(), grade: z.string().optional() })),
  certifications: z.array(z.object({ name: z.string(), issuer: z.string().optional(), date: z.string().optional() })).default([]),
  awards: z.array(z.string()).default([]),
  languages: z.array(z.object({ name: z.string(), level: z.string() })).default([]),
  meta: z.object({ sectionOrder: z.array(z.string()).optional(), hiddenSections: z.array(z.string()).default([]) }).default({}),
});
```

### 9.3 Market resume styles (seed data; admin-editable)

| Code | Market | Title | Page | Max pages | Photo | DOB | Spelling | Notes for AI (`rulesPrompt`) |
|---|---|---|---|---|---|---|---|---|
| US_RESUME | United States | Resume | Letter | 1 (≤10 yrs exp) / 2 | No | No | en-US | Reverse-chronological; strong action verbs; quantified achievements; no personal details beyond contact; city + state only; "Summary" 2–3 lines; skills section near top for tech roles |
| CA_RESUME | Canada | Resume | Letter | 2 | No | No | en-CA | Like US; bilingual skills worth highlighting |
| UK_CV | United Kingdom | CV | A4 | 2 | No | No | en-GB | "Personal Statement" 3–4 lines; British spelling; no photo/DOB; month-year dates |
| IE_CV | Ireland | CV | A4 | 2 | No | No | en-GB | As UK |
| AU_RESUME | Australia | Resume | A4 | 2–3 | No | No | en-AU | Career objective/summary; key skills; referees "available on request" |
| IN_RESUME | India | Resume | A4 | 2 | Optional | Optional | en-IN | May include personal details section if student opts in; CGPA/percentages accepted |
| DE_LEBENSLAUF | Germany | Lebenslauf / CV | A4 | 2 | Optional | Optional | en-GB or de | Tabular chronology; precise dates MM/YYYY; P2 for German language |
| AE_CV | UAE / Gulf | CV | A4 | 2 | Common | Optional | en-GB | Nationality & visa status often included |

Adding a market = insert a `Market` row + pick/create a `ResumeStyle`. **No code change.**

### 9.4 AI prompts and rules
- **Truthfulness rules (hard, in the system prompt and validated after generation):**
  1. Never invent employers, job titles, dates, degrees, certifications, metrics or skills that aren't in the master profile.
  2. You may: reorder sections and bullets, rephrase bullets, merge or trim bullets, choose which experience to emphasise, rewrite the summary, and surface skills from the profile that match the JD.
  3. Never remove a job from the work history if doing so creates an unexplained gap of more than 6 months (instead, shorten it to 1 bullet).
  4. Respect the style's `maxPages`, spelling and `includePhoto`/`includeDob`.
- **Post-generation validator (code, not AI):** every company, title and date in the output must match an entry in the master profile (by `id`). Every skill must exist in the master profile skills or in experience technologies. On failure, auto-retry once with the error list. If it still fails, show the employee the diff and block "Mark as applied" until fixed.
- **Prompt files** live in `/src/server/ai/prompts/*.ts` as typed template functions: `parseResumePrompt`, `analyzeJdPrompt`, `tailorResumePrompt`, `coverLetterPrompt`. Use Claude **tool use / JSON output** with the zod schema converted to JSON Schema (`zod-to-json-schema`) so the output is always valid JSON.
- **Tailor prompt skeleton:**
  ```
  SYSTEM: You are an expert {style.name} writer for the {market.name} job market. Output ONLY via the provided tool.
  Rules: {truthfulness rules} {style.rulesPrompt} Target length: {style.maxPages} page(s).
  USER: MASTER_PROFILE: {json}
        JOB: {title} at {company}, {location}. JD_ANALYSIS: {json}. JD: {text}
        Task: produce a tailored resume JSON that maximises relevant keyword coverage truthfully.
  ```
- **Cost and limits:** log every call in `AiUsage`. Rate limit 60 generations/hour per employee and 300/day per student (admin setting). Cache JD analysis by hash for 30 days. Use the configured model for tailoring and parsing. A cheaper model (env `ANTHROPIC_MODEL_FAST`) may be used for JD analysis.

### 9.5 ATS score (deterministic, no AI)
`score = 0.5 × keywordCoverage + 0.2 × titleSimilarity + 0.2 × skillsOverlap + 0.1 × formatChecks`
- keywordCoverage = % of JD keywords (from analysis, weighted required × 2) found in the resume text (case-insensitive, stemmed).
- formatChecks = standard section headings present, no tables/images in the body, length within maxPages, contact info present.
Show a breakdown tooltip. This is a guide for employees, not a promise to students.

### 9.6 Rendering
- `@react-pdf/renderer` templates in `/src/resume/templates/{classic,modern,compact}.tsx`. All of them are **ATS-safe**: single column, real text (no images of text), standard fonts (Inter / Source Serif embedded), no tables for layout, and headings from the style config.
- DOCX via the `docx` library, mirroring the same structure.
- File names: `{StudentName}_{Company}_{JobTitle}_{yyyy-mm-dd}.pdf` (slugified).
- Rendering runs server-side in an Inngest function (or a route handler for live preview, < 1.5s). Store outputs in R2 under `students/{studentId}/resumes/{versionId}.(pdf|docx)`.

---

## 10. Security, privacy and compliance

- **Auth:** argon2id hashing; email verification; reset tokens hashed in the DB and valid 30 minutes; session JWT 7 days (students) / 12 hours (staff); **TOTP 2FA mandatory** for EMPLOYEE/MANAGER/ADMIN at first login; account lockout after 8 failed attempts in 15 minutes.
- **Never send secrets to the client:** API responses and Server Component props must be built with explicit `select` (never return whole User rows). Add a lint rule or test to make sure `passwordHash`, `totpSecretEnc` and `*Enc` fields never appear in a serialised response.
- **Credential vault:** envelope encryption, AES-256-GCM with a per-record data key encrypted by a master key (`VAULT_MASTER_KEY`, 32 bytes, from env/KMS). Secrets are revealed **only** to the actively assigned employee through a "Reveal" button that is logged (`CredentialAccessLog`) and re-hidden after 30s. Copy-to-clipboard is also logged. Admins see that credentials exist and the access log, never the values. On reassignment, the old employee loses access immediately. The student can rotate or delete entries anytime and gets an email whenever an entry is viewed (daily digest of access, not per view).
- **Consent & ToS note:** at onboarding, the student explicitly authorises UpayaInd to use their accounts to apply on their behalf. Show a plain-language notice that some job portals' terms restrict account sharing, and that the student accepts this. Keep the consent timestamp and version.
- **Files:** private R2 bucket; every download goes through `/api/files/[id]`, which checks permission and returns a signed URL valid for 5 minutes. Accept only these MIME types (by magic-number check): PDF, DOCX, PNG, JPG. Run a virus scan hook (P1).
- **Authorization:** central `can(user, action, resource)` + `assertEmployeeCanAccessStudent`. Unit tests for every role and resource pair.
- **Audit log:** price changes, assignment changes, attendance corrections, leave decisions, refunds, role changes, credential reveals, data exports, and impersonation (P1 "view as student", read-only).
- **Headers:** strict CSP, HSTS, X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin.
- **Rate limits:** login 10/15 min per IP+email; signup 5/hour per IP; contact 5/hour per IP; AI as in 9.4.
- **Privacy:** data export (JSON + files ZIP) and account deletion requests from `/app/settings` (admin confirms, 30-day soft delete, then purge except legally required payment records). Cookie consent. Disclose AI processing and staff message access in the Privacy Policy. Comply with GDPR/UK GDPR (EU/UK students), CCPA (California) and India's DPDP Act.
- **Backups:** daily DB backups (provider PITR), R2 versioning on. Staging uses anonymised seed data only.

---

## 11. Admin portal details

- **Overview `/admin`:** cards for active students, MRR **per currency**, new students this week, churn this month, applications today vs total target (all students), students below target, interviews this week, offers this month, employees clocked in now, pending leave requests, students AWAITING assignment, new leads. Plus charts: applications/day (30d), revenue/month (12m) per currency, and funnel (leads → signups → paid).
- **Students list:** search, filters (market, plan, status, employee, onboarding incomplete, below target) and columns (name, market, plan, status, period end, employee, today x/y, total applications, interviews). Row → **Student 360°**: profile, preferences, subscription & payments, assignment history (with reassign button), applications, resumes, messages (read-only), mock interviews, credential access log, notes (internal), audit trail.
- **Employees:** create (name, email, phone, employee code auto, title, markets, maxStudents, manager, work schedule, role EMPLOYEE/MANAGER). An invite email sets the password + 2FA. Deactivate (auto re-homes students using F2, after confirmation). Employee page: assigned students + load bar, today/week/month performance, attendance calendar, leave balance, login history.
- **Assignments:** an "Awaiting assignment" queue at the top with one-click auto-assign or manual pick. A load board shows each employee's active count / max with a visual bar. Rules panel holds the auto-assign toggle and default maxStudents.
- **Plans & pricing:** a matrix of plans × markets × intervals with price, daily target, Stripe price ID (with a "Create in Stripe" button that calls the API) and active toggle. The price floor is validated.
- **Payments:** list with filters, invoice PDF, and refund (full/partial via provider API, audit-logged).
- **Attendance:** see F8. **Leave:** see F9.
- **CMS:** list by kind, Tiptap editor, SEO fields, image upload with required alt text, preview, publish/unpublish, revision history (last 20 versions in `data.revisions`).
- **Reports:** revenue, delivery (target adherence by student/employee), staff performance, response/interview/offer rates by market and role family, retention cohorts. Every report can be exported to CSV/XLSX.
- **Settings:** business info per market (legal name, address, tax IDs), notification templates (subject/body with variables), auto-assign toggle, NO_RESPONSE auto-days (default 30), AI limits, below-target alert time.

---

## 12. Non-functional requirements

- **Responsive:** every portal screen is usable at 375px. Employee and admin are optimised for desktop (≥ 1280px) but fully functional on mobile. The student portal is mobile-first (most students check on phones).
- **Accessibility:** WCAG 2.2 AA; keyboard navigable; visible focus; colour contrast ≥ 4.5:1; form errors announced.
- **Time zones:** store UTC; show in the viewer's `User.timezone` (auto-detected at signup, editable). Each application shows "Applied 9:42 PM your time".
- **Currencies:** format with `Intl.NumberFormat(locale, {style:'currency', currency})`. Never sum different currencies.
- **Performance:** portal pages TTFB < 500ms p95. Paginate all tables (cursor-based, 25/page). DB indexes as defined.
- **Observability:** Sentry for errors, Inngest dashboard for jobs, a structured log line for every webhook.
- **Scalability:** designed for 5,000 students / 200 employees without architecture change.

---

## 13. Design system (brand)

Brand colours come from the UpayaInd logo (blue rising arrow):

| Token | Hex | Use |
|---|---|---|
| `--brand-royal` | `#0A35D6` | Primary buttons, links, active nav |
| `--brand-blue` | `#0A7CF0` | Secondary accents, charts |
| `--brand-sky` | `#18B8F2` | Gradient end, highlights, progress |
| `--ink` | `#0B1846` | Headings, dark sections |
| `--paper` | `#FBFAF6` | Marketing section backgrounds |
| `--success` | `#1E7B4F` | Interview/offer/hired |
| `--warning` | `#B7791F` | Below target, pending |
| `--danger` | `#C8352B` | Errors, rejected |

- **Signature gradient:** `linear-gradient(90deg, #0A35D6, #0A7CF0, #18B8F2)`. Use it for primary CTA hover, progress bars and the hero accent. The logo's upward arrow can be reused as a motif (section dividers, success states).
- **Type:** Fraunces (display headings on the marketing site) + Inter (UI, body, numbers with `tabular-nums`).
- **Status pill colours:** APPLIED blue, VIEWED violet, RECRUITER_REPLIED amber, ASSESSMENT cyan, INTERVIEW_* green, OFFER/HIRED solid green, REJECTED red, NO_RESPONSE grey, WITHDRAWN/ON_HOLD slate.
- **Dark mode:** the portals support system dark mode via shadcn tokens. The marketing site is light only.
- **Imagery:** real photos only (students with consent, team). No AI-generated people.

---

## 14. Integrations and environment variables

```
DATABASE_URL=
AUTH_SECRET=
AUTH_GOOGLE_ID= / AUTH_GOOGLE_SECRET=
NEXT_PUBLIC_APP_URL=https://upayaind.com
R2_ACCOUNT_ID= / R2_ACCESS_KEY_ID= / R2_SECRET_ACCESS_KEY= / R2_BUCKET=
VAULT_MASTER_KEY=            # 32-byte base64
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-5-5
ANTHROPIC_MODEL_FAST=
STRIPE_SECRET_KEY= / STRIPE_WEBHOOK_SECRET= / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
RAZORPAY_KEY_ID= / RAZORPAY_KEY_SECRET= / RAZORPAY_WEBHOOK_SECRET=      # P1
RESEND_API_KEY= / EMAIL_FROM="UpayaInd <hello@upayaind.com>"
INNGEST_EVENT_KEY= / INNGEST_SIGNING_KEY=
UPSTASH_REDIS_REST_URL= / UPSTASH_REDIS_REST_TOKEN=
SENTRY_DSN=
NEXT_PUBLIC_GA_ID= / NEXT_PUBLIC_CLARITY_ID=
CALCOM_LINK=
```
Validate env at boot with zod (`/src/env.ts`). Fail fast if any variable is missing.

---

## 15. Project structure

```
/
├─ CLAUDE.md                 # Appendix A
├─ docs/SPEC.md              # this file
├─ docs/DECISIONS.md         # running log of choices not covered here
├─ prisma/schema.prisma  prisma/seed.ts  prisma/migrations/
├─ emails/                   # React Email templates
├─ src/
│  ├─ app/
│  │  ├─ (marketing)/…       # public pages
│  │  ├─ (auth)/…            # login, signup, reset, 2fa
│  │  ├─ app/…               # student portal
│  │  ├─ work/…              # employee portal
│  │  ├─ admin/…             # admin portal
│  │  └─ api/ (webhooks/stripe, webhooks/razorpay, inngest, files/[id], heartbeat, auth/[...nextauth])
│  ├─ components/ (ui/ = shadcn, marketing/, portal/, charts/, resume/)
│  ├─ server/
│  │  ├─ auth/ (config, rbac.ts, guards.ts, totp.ts)
│  │  ├─ db.ts
│  │  ├─ services/ (assignment.ts, applications.ts, resumes.ts, attendance.ts, leave.ts, billing/, notify.ts, vault.ts, files.ts, cms.ts, reports.ts)
│  │  ├─ ai/ (client.ts, prompts/, validators.ts, ats-score.ts)
│  │  └─ jobs/ (inngest functions)
│  ├─ resume/ (schema.ts, templates/, render-pdf.tsx, render-docx.ts, styles.ts)
│  ├─ lib/ (utils, format, url-normalize.ts, dates.ts)
│  ├─ i18n/  messages/en.json
│  └─ env.ts
└─ tests/ (unit/, e2e/)
```
Conventions: Server Actions in `actions.ts` next to each route, each one starting with `const user = await requireRole([...])`. All input is parsed with zod. Business logic lives in `server/services/*` (pure, unit-testable). UI never calls Prisma directly.

---

## 16. Seed data (`prisma/seed.ts`)

- Markets: US (USD, America/New_York, Stripe, minPrice 4900), UK, CA, AU, IN (inactive except US).
- Resume styles from Section 9.3; templates classic/modern/compact.
- Plans: Basic, Standard (featured) and Premium. US prices are placeholders, so **confirm with the client before launch**. Daily targets 25 / 35 / 50.
- Leave types: Casual 12, Sick 8, Earned 15, Unpaid 0.
- Users: 1 admin, 1 manager, 3 employees (maxStudents 8), 10 students across onboarding states, 300 applications across statuses, interviews, messages, 30 days of attendance. **Fake data only** (use `@faker-js/faker`).
- CMS: legal page placeholders (marked DRAFT, client to supply final text), 6 FAQs, 3 sample stories (DRAFT).

---

## 17. Build plan for Claude Code (milestones)

Work in order. After each milestone, run `pnpm typecheck && pnpm lint && pnpm test && pnpm e2e`, commit, and deploy to staging. Paste the prompt into Claude Code with this spec in the repo.

**Priority legend:** **P0** is required for launch. **P1** comes right after launch.

### M0. Foundation (P0)
**Prompt:** "Read docs/SPEC.md sections 4, 8, 14, 15. Scaffold the Next.js 15 TypeScript app with Tailwind v4, shadcn/ui, Prisma (schema exactly as Section 8 + migration extras), Auth.js v5 with credentials + Google, env validation, Sentry, Inngest, Upstash rate limit, R2 file service with signed URLs, next-intl, and the folder structure in Section 15. Add a seed script per Section 16. Set up GitHub Actions CI."
**Done when:** the app boots, migrations run, the seed works, CI is green, and `/api/health` returns OK.

### M1. Auth, roles and layouts (P0)
**Prompt:** "Implement Section 3 roles and Section 10 auth: signup (student), login, email verification, reset password, TOTP 2FA for staff, lockout, middleware route protection, `requireRole`, `can()`, `assertEmployeeCanAccessStudent`, LoginEvent logging. Build the three portal shells (sidebar + topbar + notification bell) per Section 13 tokens, responsive."
**Done when:** each role lands on its portal; a wrong role gets a 403; RBAC unit tests cover every row of the Section 3 table.

### M2. Plans, checkout and subscriptions (P0)
**Prompt:** "Implement Markets, Plans, PlanPrice admin CRUD with price-floor guard; pricing page data; Stripe Checkout + customer portal; webhook handler with idempotency (WebhookEvent) per F1/F11; invoices (PDF) with numbering; Payment records; renewal reminder jobs."
**Done when:** a test-mode payment activates the subscription via webhook only, and the invoice PDF downloads.

### M3. Assignment engine (P0)
**Prompt:** "Implement F2 exactly: auto-assignment service with row locking, AWAITING queue, manual reassign with history, cover assignments, re-home on deactivate, notifications, admin Assignments page with load board."
**Done when:** a concurrency test (20 parallel activations) never exceeds maxStudents and always picks the least-loaded employee.

### M4. Student onboarding, profile and vault (P0)
**Prompt:** "Implement F3 wizard, resume upload + parse job (Section 9.1–9.2), master profile editor, job preferences, credential vault with envelope encryption and access logging (Section 10)."
**Done when:** an uploaded PDF becomes an editable master profile; vault values are unreadable in the DB and reveal is logged.

### M5. Resume engine + application workspace (P0, the most important milestone)
**Prompt:** "Implement Section 9 fully and F4: JD analysis (cached), tailoring with tool-use JSON, truthfulness validator + retry, ATS score, PDF/DOCX templates per market style, live preview, structured editor, cover letter, duplicate checks, Mark as applied (locks ResumeVersion), quick log, CSV bulk import, keyboard shortcuts, AiUsage logging and rate limits."
**Done when:** JD → tailored PDF in < 60s; the validator rejects any invented company/skill (unit tests with adversarial fixtures); US and UK styles render differently (Letter vs A4, "Resume" vs "CV", US vs UK spelling).

### M6. Statuses, interviews and student dashboard (P0)
**Prompt:** "Implement F5 status lifecycle + ApplicationEvent timeline + Interview records + NO_RESPONSE nightly job, and F6 student dashboard, applications list/detail, companies view, resumes page, interviews with .ics."
**Done when:** an application logged by an employee appears on the student dashboard instantly with a downloadable resume; the target progress is correct across time zones.

### M7. Employee workday: targets, attendance, leave (P0)
**Prompt:** "Implement F8 attendance (clock in/out, breaks, heartbeats, nightly EmployeeDay rollup, auto-close), F9 leave (types, balances, apply, approve, holidays, calendar, cover prompt), F10 targets (StudentDay, RAG status, 3pm alert), employee Today page and timesheet, admin attendance board + exports."
**Done when:** a simulated day produces correct clocked/active minutes and attendance status; approved leave blocks auto-assignment.

### M8. Messaging and notifications (P0)
**Prompt:** "Implement F7 messaging (threads, attachments, read receipts, polling, unread-email job, broadcast) and F13 notify service with in-app + email templates for every event in the table."
**Done when:** every event in the F13 table sends the right in-app and email notification (tested with Resend test mode).

### M9. Public website + CMS + SEO (P0)
**Prompt:** "Implement Section 6: all marketing pages, CMS (CmsEntry kinds, Tiptap editor, SEO fields, revisions, on-demand revalidation), market detection, cookie consent + GA4/Clarity, JSON-LD, sitemap/robots, OG images, contact → Lead + auto-reply, Cal.com embed, dashboard demo with fake data. Hit Lighthouse ≥ 90 on mobile and desktop."
**Done when:** Lighthouse reports are attached to the PR; every page has a unique title/description; legal pages are publishable from the CMS.

### M10. Admin dashboards and reports (P0 core, P1 advanced)
**Prompt:** "Implement Section 11 admin overview, Student 360°, Employee page, payments + refunds, leads inbox, reports with CSV/XLSX export, audit log viewer, settings."
**Done when:** the admin can answer, without SQL: who's behind target today, who's clocked in, MRR per currency, and the history of any student.

### M11. Hardening and launch (P0)
**Prompt:** "Run a security pass against Section 10 (secret-field response test, RBAC tests, CSP, rate limits), accessibility pass (axe), e2e tests for flows F1–F9, performance pass, backups, production env, data import from old site (Section 18), redirects, and a launch checklist."
**Done when:** every checklist item in Section 19 passes.

### P1 backlog (after launch)
Razorpay for India · WhatsApp notifications · student "pause" · admin "view as student" (read-only impersonation) · browser extension for one-click logging from LinkedIn/Indeed · virus scanning · German/other UI languages · mobile PWA + push · referral programme with credits · review-request automation · advanced cohort reports.

### Suggested timeline
With one full-time developer using Claude Code: **M0–M5 in week 1–2**, **M6–M9 in week 3**, **M10–M11 in week 4**. To launch in **2 weeks**, launch with M0–M6 + M8 + the essential M9 pages (home, pricing, how it works, legal, contact), and ship M7 (attendance/leave), the remaining M9 and M10 in the following 2 weeks. Agree this split with the client up front.

---

## 18. Migration from the current site

- Export the existing users (students and employees) and payments from the old database. Import students as `User(role=STUDENT)` with **no password**, then send a "Set your password on the new UpayaInd" email. Import payments as historical `Payment` rows (provider STRIPE, linked by email).
- Don't import the old test records ("Test User", "Test" employee, "Demo" enquiry).
- 301 redirects: `/signin → /login`, `/signup → /signup`, `/services → /how-it-works`, `/admin → /admin`, `/employee/profile → /work`, `/blog/* → /blog`.
- Rotate all credentials of the old system (admin password, Stripe keys) at cut-over.

---

## 19. Launch checklist (acceptance)

- [ ] F1–F13 e2e tests pass on staging with Stripe test mode.
- [ ] No API/RSC payload contains `passwordHash`, `totpSecretEnc` or any `*Enc` field (automated test).
- [ ] Employee cannot access an unassigned student by URL manipulation (automated test).
- [ ] Credential reveal works only for the active assignee and is logged.
- [ ] Price floor blocks a price below the market minimum.
- [ ] Subscription activates only via webhook.
- [ ] Tailored resume never contains a company, title, date or skill absent from the master profile (validator tests).
- [ ] US resume = Letter / "Resume" / en-US; UK CV = A4 / "CV" / en-GB.
- [ ] Lighthouse ≥ 90 on home, pricing, how it works (mobile + desktop).
- [ ] All legal pages are published with client-approved text.
- [ ] Sitemap, robots, canonical, OG and JSON-LD validated (Google Rich Results test).
- [ ] Cookie consent gates analytics.
- [ ] 2FA is enforced for all staff accounts.
- [ ] Backups verified (restore test on staging).
- [ ] Sentry receives a test error; Inngest jobs are visible.
- [ ] Old-site redirects work; old admin credentials are revoked.

---

## 20. Open questions for the client (don't block the build; use the defaults)

| Question | Default if no answer |
|---|---|
| Final plan names, prices per interval, daily targets | Basic/Standard/Premium, targets 25/35/50, placeholder prices (blocked from publishing until set) |
| Is the guarantee "interview in 60 days or next month free"? | Guarantee page in DRAFT, not linked |
| Employee work hours and weekly off days | Mon–Fri, 9 hours, Asia/Kolkata timezone |
| Leave quotas | Casual 12, Sick 8, Earned 15 |
| Max students per employee | 8 |
| Should students see the employee's full name and photo? | First name + photo |
| Can students edit their resume themselves? | Master profile yes; tailored versions no (view/download only) |
| Which job portals to support in the vault | Email, LinkedIn, Indeed, Dice, Glassdoor, ZipRecruiter, Handshake, Other |

---

## Appendix A: `CLAUDE.md` starter (put at repo root)

```md
# UpayaInd platform

Full spec: docs/SPEC.md. Read the relevant section before any task. Log new decisions in docs/DECISIONS.md.

## Stack
Next.js 15 App Router + TS strict, Tailwind v4 + shadcn/ui, Prisma + Postgres, Auth.js v5,
Inngest jobs, R2 storage, Anthropic API for resume AI, @react-pdf/renderer + docx, Resend, Stripe.

## Rules
- Server-side auth on every action: `await requireRole([...])`; for student data from staff use `assertEmployeeCanAccessStudent`.
- Always use Prisma `select`; never return passwordHash, totpSecretEnc or *Enc fields to the client.
- Validate all input with zod (shared schemas in src/lib/schemas).
- Money = integer minor units + currency. Never sum across currencies.
- Store UTC; display in user timezone.
- Business logic in src/server/services (pure, unit-tested); UI never calls Prisma directly.
- Resume AI must obey the truthfulness rules in SPEC §9.4; always run the validator.
- Every UI string through next-intl.
- Mobile-first; check 375px for every new screen.
- Brand tokens: royal #0A35D6, blue #0A7CF0, sky #18B8F2, ink #0B1846.

## Commands
pnpm dev | pnpm typecheck | pnpm lint | pnpm test | pnpm e2e | pnpm db:migrate | pnpm db:seed

## Definition of done
Typecheck + lint + unit + e2e green, responsive at 375/768/1280, a11y (axe) clean, spec acceptance criteria met.
```

---

*Prepared by Creativals.com · USA +1 628 628 4743 · India +91 799 700 1700*
