/**
 * Seed data (SPEC §16). Fake data only (@faker-js/faker).
 *
 *   pnpm db:seed                      # reference data + demo users/applications
 *   SEED_DEMO_PRICES=1 pnpm db:seed   # also fill sample US prices so checkout can be tested
 *
 * Run with `--conditions=react-server` (see package.json) so server-only modules load.
 * Idempotent for reference data; demo data is only created when the DB has no students.
 */
import "dotenv/config";
import { faker } from "@faker-js/faker";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "@node-rs/argon2";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import type { ApplicationStatus, JobSource, WorkMode } from "../src/generated/prisma/enums";
import { seal } from "../src/server/crypto";
import { normalizeJobUrl } from "../src/lib/url-normalize";
import { addDayKey, dateOnly, dayKey, isoWeekday, startOfDayInTz } from "../src/lib/dates";
import type { ResumeData } from "../src/resume/schema";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
faker.seed(20261012);

export const DEMO_PASSWORD = "Upaya!Demo-2026";
/** Dev-only TOTP secret for seeded staff (add to any authenticator app). */
export const DEMO_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

const STAFF_TZ = "Asia/Kolkata";

// ───────────────────────── Reference data ─────────────────────────

const RESUME_STYLES = [
  {
    code: "US_RESUME", name: "US Resume", documentTitle: "Resume", pageSize: "LETTER", maxPages: 1, dateFormat: "MMM yyyy", spelling: "en-US",
    includePhoto: false, includeDob: false, includeNationality: false, includeFullAddress: false, summaryLabel: "Summary",
    sectionOrder: ["summary", "skills", "experience", "projects", "education", "certifications"],
    rulesPrompt: "Reverse-chronological. Strong action verbs. Quantified achievements. No personal details beyond contact. City + state only. 'Summary' of 2–3 lines. Put the skills section near the top for technical roles. One page for up to 10 years of experience, otherwise at most two pages. Use US spelling.",
  },
  {
    code: "CA_RESUME", name: "Canadian Resume", documentTitle: "Resume", pageSize: "LETTER", maxPages: 2, dateFormat: "MMM yyyy", spelling: "en-CA",
    includePhoto: false, includeDob: false, includeNationality: false, includeFullAddress: false, summaryLabel: "Summary",
    sectionOrder: ["summary", "skills", "experience", "projects", "education", "certifications", "languages"],
    rulesPrompt: "Like a US resume (reverse-chronological, quantified, no personal details). Bilingual (English/French) skills are worth highlighting. Canadian spelling.",
  },
  {
    code: "UK_CV", name: "UK CV", documentTitle: "CV", pageSize: "A4", maxPages: 2, dateFormat: "MMM yyyy", spelling: "en-GB",
    includePhoto: false, includeDob: false, includeNationality: false, includeFullAddress: false, summaryLabel: "Personal Statement",
    sectionOrder: ["summary", "experience", "skills", "education", "projects", "certifications"],
    rulesPrompt: "Write a 'Personal Statement' of 3–4 lines. Use British spelling throughout (e.g. 'organised', 'optimised', 'analyse'). No photo or date of birth. Month-year dates. Two pages maximum.",
  },
  {
    code: "IE_CV", name: "Irish CV", documentTitle: "CV", pageSize: "A4", maxPages: 2, dateFormat: "MMM yyyy", spelling: "en-GB",
    includePhoto: false, includeDob: false, includeNationality: false, includeFullAddress: false, summaryLabel: "Personal Statement",
    sectionOrder: ["summary", "experience", "skills", "education", "projects", "certifications"],
    rulesPrompt: "As a UK CV: Personal Statement of 3–4 lines, British spelling, no photo or DOB, month-year dates, two pages maximum.",
  },
  {
    code: "AU_RESUME", name: "Australian Resume", documentTitle: "Resume", pageSize: "A4", maxPages: 3, dateFormat: "MMM yyyy", spelling: "en-AU",
    includePhoto: false, includeDob: false, includeNationality: false, includeFullAddress: false, summaryLabel: "Career Summary",
    sectionOrder: ["summary", "skills", "experience", "education", "projects", "certifications"],
    rulesPrompt: "Career objective/summary at the top, then a 'Key skills' section. Australian spelling. 2–3 pages. End with 'Referees available on request'.",
  },
  {
    code: "IN_RESUME", name: "Indian Resume", documentTitle: "Resume", pageSize: "A4", maxPages: 2, dateFormat: "MMM yyyy", spelling: "en-IN",
    includePhoto: false, includeDob: false, includeNationality: false, includeFullAddress: false, summaryLabel: "Profile Summary",
    sectionOrder: ["summary", "skills", "experience", "projects", "education", "certifications"],
    rulesPrompt: "Two pages maximum. CGPA or percentages are accepted in education. Include a personal details section only if the student opted in (photo/DOB fields present).",
  },
  {
    code: "DE_LEBENSLAUF", name: "German Lebenslauf / CV", documentTitle: "Lebenslauf / CV", pageSize: "A4", maxPages: 2, dateFormat: "MM/yyyy", spelling: "en-GB",
    includePhoto: true, includeDob: true, includeNationality: false, includeFullAddress: true, summaryLabel: "Profile",
    sectionOrder: ["summary", "experience", "education", "skills", "languages", "certifications"],
    rulesPrompt: "Tabular chronology with precise MM/YYYY dates. Concise, factual tone. Photo and date of birth are optional and only included if provided. Two pages maximum.",
  },
  {
    code: "AE_CV", name: "UAE / Gulf CV", documentTitle: "CV", pageSize: "A4", maxPages: 2, dateFormat: "MMM yyyy", spelling: "en-GB",
    includePhoto: true, includeDob: false, includeNationality: true, includeFullAddress: false, summaryLabel: "Professional Summary",
    sectionOrder: ["summary", "experience", "skills", "education", "certifications", "languages"],
    rulesPrompt: "Nationality and visa status are often included when provided. A photo is common if provided. British spelling. Two pages maximum.",
  },
] as const;

const MARKETS = [
  { code: "US", name: "United States", currency: "USD", locale: "en-US", minPriceMinor: 4900, defaultTimezone: "America/New_York", style: "US_RESUME", isActive: true, phoneDisplay: "+1 628 628 4743", whatsapp: "16286284743" },
  { code: "UK", name: "United Kingdom", currency: "GBP", locale: "en-GB", minPriceMinor: 3900, defaultTimezone: "Europe/London", style: "UK_CV", isActive: false, phoneDisplay: null, whatsapp: null },
  { code: "CA", name: "Canada", currency: "CAD", locale: "en-CA", minPriceMinor: 6500, defaultTimezone: "America/Toronto", style: "CA_RESUME", isActive: false, phoneDisplay: null, whatsapp: null },
  { code: "AU", name: "Australia", currency: "AUD", locale: "en-AU", minPriceMinor: 7500, defaultTimezone: "Australia/Sydney", style: "AU_RESUME", isActive: false, phoneDisplay: null, whatsapp: null },
  { code: "IN", name: "India", currency: "INR", locale: "en-IN", minPriceMinor: 299900, defaultTimezone: "Asia/Kolkata", style: "IN_RESUME", isActive: false, phoneDisplay: "+91 799 700 1700", whatsapp: "917997001700" },
] as const;

const PLANS = [
  {
    code: "basic", name: "Basic", isFeatured: false, sortOrder: 1, dailyTarget: 25, interviewsPromise: null,
    description: "A steady pipeline for focused searches.",
    features: ["25 tailored applications every weekday", "Resume tailored to every job", "Live tracking dashboard", "Dedicated specialist", "Interview prep library"],
    demo: { MONTHLY: 19900, QUARTERLY: 53700 },
  },
  {
    code: "standard", name: "Standard", isFeatured: true, sortOrder: 2, dailyTarget: 35, interviewsPromise: null,
    description: "More volume for faster results.",
    features: ["35 tailored applications every weekday", "Resume tailored to every job", "Live tracking dashboard", "Dedicated specialist", "Cover letters where useful", "Mock interviews"],
    demo: { MONTHLY: 29900, QUARTERLY: 80700 },
  },
  {
    code: "premium", name: "Premium", isFeatured: false, sortOrder: 3, dailyTarget: 50, interviewsPromise: null,
    description: "Maximum reach for competitive markets.",
    features: ["50 tailored applications every weekday", "Resume tailored to every job", "Live tracking dashboard", "Dedicated senior specialist", "Cover letters where useful", "Priority mock interviews"],
    demo: { MONTHLY: 44900, QUARTERLY: 121200 },
  },
] as const;

const LEAVE_TYPES = [
  { name: "Casual", annualQuota: 12, paid: true, carryForward: false },
  { name: "Sick", annualQuota: 8, paid: true, carryForward: false },
  { name: "Earned", annualQuota: 15, paid: true, carryForward: true },
  { name: "Unpaid", annualQuota: 0, paid: false, carryForward: false },
  { name: "Comp-off", annualQuota: 0, paid: true, carryForward: false },
];

const SETTINGS: Record<string, Prisma.InputJsonValue> = {
  autoAssignEnabled: true,
  defaultMaxStudents: 8,
  noResponseDays: 30,
  belowTargetAlertTime: "15:00",
  aiLimits: { employeePerHour: 60, studentPerDay: 300 },
  business: {
    US: { legalName: "[Legal entity name]", address: "[Business address]", taxId: "" },
    IN: { legalName: "[Legal entity name]", address: "[Business address]", taxId: "" },
  },
};

const FAQS = [
  ["Do I ever have to apply myself?", "No. Your specialist applies for you every weekday. You focus on upskilling and interviews."],
  ["How is my resume tailored?", "For each job we rewrite your resume around the job description, using only your real experience and skills. We never invent experience."],
  ["Can I see every application?", "Yes. Your dashboard shows the company, role, date, job link, status and the exact resume used for each application."],
  ["How do you apply on my behalf?", "Using the email and job portal logins you add to your encrypted vault, with your written authorisation. Only your assigned specialist can use them, and every access is logged."],
  ["Who is my specialist?", "A dedicated UpayaInd team member, assigned within hours of payment. You can message them any time from your dashboard."],
  ["What happens when I get an interview?", "Tell us from your dashboard. We help you prepare with mock interviews and targeted material, and keep applying until you accept an offer."],
  ["Can I pause or cancel?", "You can cancel any time from billing; your plan runs until the end of the period you paid for. Your data stays available to you."],
  ["Is my data safe?", "Logins are encrypted with per-record keys, files are stored privately and served through short-lived links, and staff access is limited and audited."],
] as const;

const LEGAL = [
  ["privacy", "Privacy Policy"],
  ["terms", "Terms of Service"],
  ["refund", "Refund Policy"],
  ["guarantee", "Our Guarantee"],
  ["cookies", "Cookie Policy"],
] as const;

function doc(paragraphs: string[]) {
  return {
    body: { type: "doc", content: paragraphs.map((t) => ({ type: "paragraph", content: [{ type: "text", text: t }] })) },
    bodyHtml: paragraphs.map((t) => `<p>${t.replace(/</g, "&lt;")}</p>`).join(""),
  };
}

async function seedReference() {
  for (const s of RESUME_STYLES) {
    await db.resumeStyle.upsert({ where: { code: s.code }, update: { ...s, sectionOrder: [...s.sectionOrder] }, create: { ...s, sectionOrder: [...s.sectionOrder] } });
  }
  for (const [code, name] of [["classic", "Classic"], ["modern", "Modern"], ["compact", "Compact"]] as const) {
    await db.resumeTemplate.upsert({ where: { code }, update: { name }, create: { code, name } });
  }
  for (const m of MARKETS) {
    const style = await db.resumeStyle.findUniqueOrThrow({ where: { code: m.style } });
    const { style: _s, ...data } = m;
    await db.market.upsert({ where: { code: m.code }, update: { ...data, resumeStyleId: style.id }, create: { ...data, resumeStyleId: style.id } });
  }
  const us = await db.market.findUniqueOrThrow({ where: { code: "US" } });
  const demoPrices = process.env.SEED_DEMO_PRICES === "1";
  for (const p of PLANS) {
    const plan = await db.plan.upsert({
      where: { code: p.code },
      update: { name: p.name, description: p.description, features: [...p.features], isFeatured: p.isFeatured, sortOrder: p.sortOrder },
      create: { code: p.code, name: p.name, description: p.description, features: [...p.features], isFeatured: p.isFeatured, sortOrder: p.sortOrder },
    });
    for (const interval of ["MONTHLY", "QUARTERLY"] as const) {
      // Placeholder prices are 0 (blocked from purchase by the price floor) until the client confirms them (SPEC §16, §20).
      const amountMinor = demoPrices ? p.demo[interval] : 0;
      const existing = await db.planPrice.findUnique({ where: { planId_marketId_interval: { planId: plan.id, marketId: us.id, interval } } });
      if (!existing) {
        await db.planPrice.create({ data: { planId: plan.id, marketId: us.id, interval, amountMinor, currency: "USD", dailyTarget: p.dailyTarget } });
      } else if (demoPrices && existing.amountMinor === 0) {
        await db.planPrice.update({ where: { id: existing.id }, data: { amountMinor } });
      }
    }
  }
  for (const lt of LEAVE_TYPES) await db.leaveType.upsert({ where: { name: lt.name }, update: lt, create: lt });
  for (const [key, value] of Object.entries(SETTINGS)) await db.setting.upsert({ where: { key }, update: {}, create: { key, value } });

  const year = new Date().getUTCFullYear();
  const holidays: [string, string, string][] = [
    [`${year}-01-01`, "New Year's Day", "US"], [`${year}-07-04`, "Independence Day", "US"], [`${year}-11-26`, "Thanksgiving", "US"], [`${year}-12-25`, "Christmas Day", "US"],
    [`${year}-01-26`, "Republic Day", "IN"], [`${year}-08-15`, "Independence Day", "IN"], [`${year}-10-02`, "Gandhi Jayanti", "IN"], [`${year}-11-08`, "Diwali", "IN"],
  ];
  for (const [d, name, region] of holidays) {
    await db.holiday.upsert({ where: { date_region: { date: dateOnly(d), region } }, update: { name }, create: { date: dateOnly(d), name, region } });
  }

  for (const [i, [q, a]] of FAQS.entries()) {
    const slug = `faq-${i + 1}`;
    const { body, bodyHtml } = doc([a]);
    await db.cmsEntry.upsert({ where: { kind_slug: { kind: "FAQ", slug } }, update: {}, create: { kind: "FAQ", slug, title: q, excerpt: a, body, bodyHtml, sortOrder: i, isPublished: true, publishedAt: new Date() } });
  }
  for (const [slug, title] of LEGAL) {
    const { body, bodyHtml } = doc([`[DRAFT — the final ${title} text must be supplied and approved by UpayaInd before launch.]`]);
    await db.cmsEntry.upsert({ where: { kind_slug: { kind: "LEGAL", slug } }, update: {}, create: { kind: "LEGAL", slug, title, body, bodyHtml, isPublished: false, seoTitle: title } });
  }
  for (let i = 1; i <= 3; i++) {
    const slug = `sample-story-${i}`;
    const { body, bodyHtml } = doc(["[DRAFT — sample success story. Replace with a real story shared with the student's consent.]"]);
    await db.cmsEntry.upsert({
      where: { kind_slug: { kind: "STORY", slug } },
      update: {},
      create: {
        kind: "STORY", slug, title: `[Student name] — [Role] at [Company]`, excerpt: "[Student quote]", body, bodyHtml, isPublished: false, sortOrder: i,
        data: { studentName: "[Student name]", role: "[Role]", company: "[Company]", weeksToOffer: null, applicationsSent: null, quote: "[Student quote]", photoKey: null },
      },
    });
  }
  for (const [slug, title, excerpt] of [
    ["h1b-opt", "H1B & OPT candidates", "We target roles that sponsor and respect your visa timeline."],
    ["professionals", "Working professionals", "Keep your job. We run your search quietly in the background."],
    ["freshers", "Fresh graduates", "Reach volume early while you prepare for interviews."],
  ] as const) {
    const { body, bodyHtml } = doc([excerpt]);
    await db.cmsEntry.upsert({ where: { kind_slug: { kind: "LANDING", slug } }, update: {}, create: { kind: "LANDING", slug, title, excerpt, body, bodyHtml, isPublished: true, publishedAt: new Date(), seoTitle: `UpayaInd for ${title}` } });
  }
}

// ───────────────────────── Demo data ─────────────────────────

const ROLES = [
  { title: "Data Analyst", skills: ["SQL", "Python", "Tableau", "Excel", "Statistics", "Power BI", "A/B testing"] },
  { title: "Software Engineer", skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "AWS", "Docker", "GraphQL"] },
  { title: "Product Manager", skills: ["Roadmapping", "User research", "SQL", "Jira", "Experimentation", "Stakeholder management"] },
  { title: "Data Engineer", skills: ["Python", "Spark", "Airflow", "dbt", "Snowflake", "SQL", "Kafka"] },
  { title: "UX Designer", skills: ["Figma", "User research", "Prototyping", "Design systems", "Usability testing"] },
  { title: "Business Analyst", skills: ["SQL", "Excel", "Requirements gathering", "Process mapping", "Power BI"] },
];
const COMPANIES = ["Northwind Analytics", "Copperleaf Bank", "Halcyon Health", "Brightline Logistics", "Bluepeak Software", "Meridian Retail", "Orbital Labs", "Harborview Insurance", "Lumen Mobility", "Kestrel Energy", "Pinecrest Media", "Atlas Robotics", "Summit Foods", "Vantage Telecom", "Redwood Capital", "Silverline Travel", "Crescent Pharma", "Ironclad Security", "Granite Partners", "Willow Education"];
const STATUSES: [ApplicationStatus, number][] = [
  ["APPLIED", 120], ["VIEWED", 50], ["RECRUITER_REPLIED", 18], ["ASSESSMENT", 10], ["INTERVIEW_SCHEDULED", 10], ["INTERVIEWING", 6], ["OFFER", 3], ["HIRED", 1], ["REJECTED", 40], ["NO_RESPONSE", 36], ["WITHDRAWN", 3], ["ON_HOLD", 3],
];

function profileFor(name: string, email: string, phone: string, role: (typeof ROLES)[number]): ResumeData {
  const years = faker.number.int({ min: 2, max: 7 });
  const jobs = Math.min(3, Math.max(1, Math.ceil(years / 2.5)));
  const experience = [];
  let end: string | null = null;
  let cursor = new Date();
  for (let j = 0; j < jobs; j++) {
    const len = faker.number.int({ min: 12, max: 30 });
    const start = new Date(cursor);
    start.setMonth(start.getMonth() - len);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const company = faker.helpers.arrayElement(COMPANIES.slice(10));
    const tech = faker.helpers.arrayElements(role.skills, { min: 2, max: 4 });
    experience.push({
      id: `exp_${j + 1}`,
      company,
      title: j === 0 ? role.title : faker.helpers.arrayElement([`Junior ${role.title}`, `${role.title} Intern`, `Associate ${role.title}`]),
      location: `${faker.location.city()}, ${faker.location.state({ abbreviated: true })}`,
      startDate: fmt(start),
      endDate: end,
      bullets: Array.from({ length: 3 }, (_, b) => ({
        id: `exp_${j + 1}_b${b + 1}`,
        text: `${faker.helpers.arrayElement(["Built", "Led", "Improved", "Automated", "Designed", "Analysed", "Shipped"])} ${faker.helpers.arrayElement(tech)}-based ${faker.helpers.arrayElement(["reporting", "workflows", "features", "pipelines", "dashboards", "experiments"])} that ${faker.helpers.arrayElement(["cut turnaround time", "increased conversion", "reduced costs", "improved accuracy", "saved analyst hours"])} by ${faker.number.int({ min: 8, max: 45 })}%.`,
      })),
      technologies: tech,
    });
    end = fmt(new Date(start.getFullYear(), start.getMonth() - 1, 1));
    cursor = new Date(start.getFullYear(), start.getMonth() - 1, 1);
  }
  return {
    basics: { name, email, phone, headline: role.title, location: { city: faker.location.city(), region: faker.location.state({ abbreviated: true }), country: "United States" }, links: [{ label: "LinkedIn", url: `https://www.linkedin.com/in/${name.toLowerCase().replace(/\s+/g, "-")}` }] },
    summary: `${role.title} with ${years} years of experience delivering measurable results with ${role.skills.slice(0, 3).join(", ")}.`,
    skills: [{ group: "Core", items: role.skills.slice(0, 5) }, { group: "Tools", items: role.skills.slice(5) }].filter((g) => g.items.length),
    experience,
    projects: [],
    education: [{ id: "edu_1", institution: `${faker.location.city()} State University`, degree: faker.helpers.arrayElement(["B.S.", "M.S.", "B.A."]), field: faker.helpers.arrayElement(["Computer Science", "Statistics", "Economics", "Information Systems"]), endDate: String(new Date().getFullYear() - years) }],
    certifications: [],
    awards: [],
    languages: [{ name: "English", level: "Fluent" }],
    meta: { hiddenSections: [] },
  };
}

async function seedDemo() {
  if ((await db.studentProfile.count()) > 0) {
    console.log("• Demo data already present — skipping.");
    return;
  }
  const passwordHash = await hash(DEMO_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2 });
  const totpSecretEnc = seal(DEMO_TOTP_SECRET);
  const us = await db.market.findUniqueOrThrow({ where: { code: "US" } });
  const prices = await db.planPrice.findMany({ where: { marketId: us.id, interval: "MONTHLY" }, include: { plan: true } });
  const schedule = { days: [1, 2, 3, 4, 5], startTime: "09:30", hours: 9 };

  const admin = await db.user.create({ data: { email: "admin@upayaind.test", name: "Asha Admin", role: "ADMIN", passwordHash, timezone: STAFF_TZ, emailVerified: new Date(), totpSecretEnc, totpEnabled: true } });
  const manager = await db.user.create({
    data: { email: "manager@upayaind.test", name: "Meena Kapoor", role: "MANAGER", passwordHash, timezone: STAFF_TZ, emailVerified: new Date(), totpSecretEnc, totpEnabled: true, employee: { create: { employeeCode: "UPY-0001", title: "Operations Manager", marketIds: [us.id], maxStudents: 0, acceptingNewStudents: false, workSchedule: schedule, joiningDate: new Date("2025-01-06") } } },
    include: { employee: true },
  });
  const employees = [];
  for (const [i, [name, email]] of [["Arjun Rao", "arjun@upayaind.test"], ["Divya Menon", "divya@upayaind.test"], ["Rahul Verma", "rahul@upayaind.test"]].entries()) {
    const u = await db.user.create({
      data: {
        email, name, role: "EMPLOYEE", passwordHash, timezone: STAFF_TZ, emailVerified: new Date(), totpSecretEnc, totpEnabled: true, phone: `+9198${faker.string.numeric(8)}`,
        employee: { create: { employeeCode: `UPY-${String(12 + i).padStart(4, "0")}`, title: "Job Application Specialist", marketIds: [us.id], maxStudents: 8, workSchedule: schedule, managerId: manager.employee!.id, joiningDate: faker.date.past({ years: 1 }) } },
      },
      include: { employee: true },
    });
    employees.push(u);
  }

  // Students: 2 unpaid, 1 paid awaiting onboarding/assignment, 7 active.
  const students = [];
  for (let i = 0; i < 10; i++) {
    const first = faker.person.firstName();
    const last = faker.person.lastName();
    const name = `${first} ${last}`;
    const email = i === 0 ? "student@upayaind.test" : `${first}.${last}.${i}@example.com`.toLowerCase().replace(/[^a-z0-9.@]/g, "");
    const phone = `+1${faker.helpers.arrayElement(["415", "212", "646", "312", "617"])}555${faker.string.numeric(4)}`;
    const role = ROLES[i % ROLES.length]!;
    const state = i === 0 ? "active" : i <= 6 ? "active" : i === 7 ? "awaiting" : "unpaid";
    const onboarded = state === "active";
    const tz = faker.helpers.arrayElement(["America/New_York", "America/Chicago", "America/Los_Angeles"]);
    const master = profileFor(name, email, phone, role);
    const user = await db.user.create({
      data: {
        email, name, phone, role: "STUDENT", passwordHash, timezone: tz, emailVerified: state === "unpaid" && i === 9 ? null : new Date(),
        student: {
          create: {
            marketId: us.id,
            onboardingStep: onboarded ? 5 : state === "awaiting" ? 2 : 0,
            onboardingCompletedAt: onboarded ? faker.date.recent({ days: 40 }) : null,
            linkedinUrl: master.basics.links[0]?.url,
            workAuthorization: faker.helpers.arrayElement(["Citizen", "Green Card", "H1B", "OPT", "STEM OPT"]),
            needsSponsorship: faker.datatype.boolean(),
            targetTitles: [role.title, `Senior ${role.title}`],
            seniority: faker.helpers.arrayElement(["Entry", "Mid", "Senior"]),
            industries: faker.helpers.arrayElements(["Fintech", "Healthcare", "SaaS", "Retail", "Logistics"], 2),
            locations: faker.helpers.arrayElements(["New York, NY", "Chicago, IL", "Austin, TX", "Seattle, WA", "Remote"], 2),
            workModes: ["REMOTE", "HYBRID"],
            employmentTypes: ["FULL_TIME"],
            minSalaryMinor: faker.number.int({ min: 70, max: 140 }) * 100000,
            salaryCurrency: "USD",
            avoidCompanies: i === 0 ? ["Meridian Retail"] : [],
            targetCompanies: [],
            masterProfile: onboarded || state === "awaiting" ? (master as unknown as Prisma.InputJsonValue) : undefined,
            templateId: "classic",
            consentApplyOnBehalfAt: new Date(),
            consentTermsAt: new Date(),
            consentVersion: "2026-10-01",
            assignmentQueue: state === "awaiting" ? "AWAITING" : state === "active" ? "ASSIGNED" : null,
            awaitingSince: state === "awaiting" ? new Date() : null,
          },
        },
      },
      include: { student: true },
    });
    const price = prices[i % prices.length]!;
    if (state !== "unpaid") {
      const start = faker.date.recent({ days: 25 });
      const endD = new Date(start);
      endD.setMonth(endD.getMonth() + 1);
      const sub = await db.subscription.create({
        data: { studentId: user.student!.id, planPriceId: price.id, status: "ACTIVE", provider: "MANUAL", currentPeriodStart: start, currentPeriodEnd: endD },
      });
      if (price.amountMinor > 0) {
        await db.payment.create({ data: { subscriptionId: sub.id, studentId: user.student!.id, amountMinor: price.amountMinor, currency: "USD", status: "SUCCEEDED", provider: "MANUAL", paidAt: start, invoiceNumber: `UPY-${start.getUTCFullYear()}-${String(i + 1).padStart(6, "0")}` } });
      }
    } else {
      await db.subscription.create({ data: { studentId: user.student!.id, planPriceId: price.id, status: "PENDING_PAYMENT", provider: "STRIPE" } });
    }
    students.push({ user, master, state, role, price, tz });
  }

  // Assignments for active students (round-robin, Arjun gets student@).
  const active = students.filter((s) => s.state === "active");
  for (const [i, s] of active.entries()) {
    const emp = employees[i % employees.length]!;
    await db.assignment.create({ data: { studentId: s.user.student!.id, employeeId: emp.employee!.id, source: "AUTO", startsAt: faker.date.recent({ days: 30 }) } });
    await db.employeeProfile.update({ where: { id: emp.employee!.id }, data: { lastAssignedAt: new Date() } });
    await db.messageThread.create({ data: { studentId: s.user.student!.id, employeeId: emp.employee!.id } });
    (s as typeof s & { emp: typeof emp }).emp = emp;
  }

  // Credentials (encrypted) for active students.
  for (const s of active) {
    await db.credential.createMany({
      data: [
        { studentId: s.user.student!.id, kind: "EMAIL", label: "Application email", loginUrl: "https://mail.google.com", usernameEnc: seal(s.user.email), passwordEnc: seal(faker.internet.password({ length: 14 })), notesEnc: seal("2FA codes arrive by SMS — message me on WhatsApp.") },
        { studentId: s.user.student!.id, kind: "LINKEDIN", label: "LinkedIn", loginUrl: "https://www.linkedin.com/login", usernameEnc: seal(s.user.email), passwordEnc: seal(faker.internet.password({ length: 14 })) },
      ],
    });
  }

  // 300 applications across statuses, last 30 days, working days only.
  const statusPool: ApplicationStatus[] = STATUSES.flatMap(([st, n]) => Array.from({ length: n }, () => st));
  faker.helpers.shuffle(statusPool);
  const sources: JobSource[] = ["LINKEDIN", "INDEED", "COMPANY_SITE", "GLASSDOOR", "DICE", "ZIPRECRUITER"];
  const modes: WorkMode[] = ["REMOTE", "HYBRID", "ONSITE"];
  let n = 0;
  for (const status of statusPool) {
    const s = active[n % active.length]! as (typeof active)[number] & { emp: (typeof employees)[number] };
    n++;
    const daysAgo = status === "NO_RESPONSE" ? faker.number.int({ min: 31, max: 45 }) : ["OFFER", "HIRED", "INTERVIEWING"].includes(status) ? faker.number.int({ min: 10, max: 30 }) : faker.number.int({ min: 0, max: 29 });
    let appliedAt = new Date(Date.now() - daysAgo * 86400e3 - faker.number.int({ min: 0, max: 8 * 3600e3 }));
    while ([6, 7].includes(isoWeekday(appliedAt, STAFF_TZ))) appliedAt = new Date(appliedAt.getTime() - 86400e3);
    if (appliedAt > new Date()) appliedAt = new Date(Date.now() - 60e3);
    const company = faker.helpers.arrayElement(COMPANIES.filter((c) => c !== "Meridian Retail"));
    const title = faker.helpers.arrayElement([s.role.title, `Senior ${s.role.title}`, `${s.role.title} II`]);
    const jobUrl = `https://boards.example-jobs.com/${company.toLowerCase().replace(/\s+/g, "-")}/${faker.string.alphanumeric(8).toLowerCase()}?utm_source=linkedin`;
    const tailored: ResumeData = { ...s.master, summary: `${title} candidate: ${s.master.summary}` };
    const rv = await db.resumeVersion.create({
      data: { studentId: s.user.student!.id, kind: "TAILORED", title: `${title} – ${company}`, content: tailored as unknown as Prisma.InputJsonValue, styleCode: "US_RESUME", templateCode: "classic", atsScoreBase: faker.number.int({ min: 40, max: 62 }), atsScore: faker.number.int({ min: 74, max: 93 }), createdById: s.emp.id, lockedAt: appliedAt, createdAt: appliedAt },
    });
    const app = await db.jobApplication.create({
      data: {
        studentId: s.user.student!.id, employeeId: s.emp.employee!.id, companyName: company, companyDomain: `${company.toLowerCase().replace(/\s+/g, "")}.com`, jobTitle: title, jobUrl, jobUrlNormalized: normalizeJobUrl(jobUrl),
        location: faker.helpers.arrayElement(["New York, NY", "Remote (US)", "Chicago, IL", "Austin, TX", "Seattle, WA"]), workMode: faker.helpers.arrayElement(modes), employmentType: "FULL_TIME",
        source: faker.helpers.arrayElement(sources), jdText: `We are hiring a ${title} at ${company}. ${faker.lorem.paragraphs(2)}`, status, appliedAt, resumeVersionId: rv.id, lastStatusAt: new Date(Math.min(Date.now(), appliedAt.getTime() + faker.number.int({ min: 1, max: 9 }) * 86400e3)), createdAt: appliedAt,
      },
    });
    await db.applicationEvent.create({ data: { applicationId: app.id, fromStatus: null, toStatus: "APPLIED", byUserId: s.emp.id, at: appliedAt } });
    if (status !== "APPLIED") await db.applicationEvent.create({ data: { applicationId: app.id, fromStatus: "APPLIED", toStatus: status, byUserId: s.emp.id, at: app.lastStatusAt, note: status === "NO_RESPONSE" ? "Auto: no response after 30 days" : null } });
    if (["INTERVIEW_SCHEDULED", "INTERVIEWING", "OFFER", "HIRED"].includes(status)) {
      const future = status === "INTERVIEW_SCHEDULED";
      await db.interview.create({
        data: { applicationId: app.id, scheduledAt: future ? faker.date.soon({ days: 9 }) : faker.date.recent({ days: 10 }), timezone: s.tz, round: faker.helpers.arrayElement(["Recruiter screen", "Technical", "Hiring manager", "Panel"]), mode: faker.helpers.arrayElement(["Video", "Phone"]), meetingLink: "https://meet.example.com/abc-defg-hij", interviewers: faker.person.fullName(), prepNotes: "Review the JD and prepare two STAR stories." },
      });
    }
  }

  // Messages.
  const threads = await db.messageThread.findMany({ include: { employee: true, student: true } });
  for (const t of threads) {
    const base = Date.now() - 6 * 86400e3;
    const lines: [string, string][] = [
      ["emp", "Hi! I'm your specialist. I've reviewed your profile and will start applying today."],
      ["stu", "Thanks! Please prioritise remote roles if possible."],
      ["emp", "Noted. You'll see every application on your dashboard with the exact resume used."],
      ["stu", "Got an email from a recruiter at Halcyon Health — should I reply?"],
    ];
    for (const [k, [who, body]] of lines.entries()) {
      await db.message.create({
        data: { threadId: t.id, senderId: who === "emp" ? t.employee.userId : t.student.userId, body, createdAt: new Date(base + k * 7 * 3600e3), readAt: k < 3 ? new Date(base + k * 7 * 3600e3 + 600e3) : null },
      });
    }
  }

  // 30 days of attendance for employees (IST), plus StudentDay rollups.
  const today = dayKey(new Date(), STAFF_TZ);
  for (const e of [...employees, manager]) {
    for (let d = 30; d >= 1; d--) {
      const key = addDayKey(today, -d);
      const wd = isoWeekday(dateOnly(key), "UTC");
      const date = dateOnly(key);
      if (wd >= 6) {
        await db.employeeDay.create({ data: { employeeId: e.employee!.id, date, status: "WEEKEND" } });
        continue;
      }
      if (faker.number.float() < 0.05) {
        await db.employeeDay.create({ data: { employeeId: e.employee!.id, date, status: "ABSENT" } });
        continue;
      }
      const dayStart = startOfDayInTz(key, STAFF_TZ);
      const startedAt = new Date(dayStart.getTime() + (9 * 60 + faker.number.int({ min: 15, max: 50 })) * 60e3);
      const minutes = faker.number.int({ min: 470, max: 560 });
      const endedAt = new Date(startedAt.getTime() + minutes * 60e3);
      const session = await db.workSession.create({ data: { employeeId: e.employee!.id, startedAt, endedAt } });
      const bStart = new Date(startedAt.getTime() + 240 * 60e3);
      const bMin = faker.number.int({ min: 25, max: 45 });
      await db.breakPeriod.create({ data: { sessionId: session.id, startedAt: bStart, endedAt: new Date(bStart.getTime() + bMin * 60e3) } });
      await db.employeeDay.create({
        data: { employeeId: e.employee!.id, date, status: "PRESENT", firstLoginAt: new Date(startedAt.getTime() - 4 * 60e3), clockInAt: startedAt, clockOutAt: endedAt, clockedMinutes: minutes - bMin, breakMinutes: bMin, activeMinutes: Math.round((minutes - bMin) * faker.number.float({ min: 0.78, max: 0.93 })) },
      });
    }
  }
  for (const s of active) {
    for (let d = 30; d >= 1; d--) {
      const key = addDayKey(today, -d);
      const wd = isoWeekday(dateOnly(key), "UTC");
      if (wd >= 6) continue;
      const { start } = { start: startOfDayInTz(key, STAFF_TZ) };
      const end = startOfDayInTz(addDayKey(key, 1), STAFF_TZ);
      const applied = await db.jobApplication.count({ where: { studentId: s.user.student!.id, appliedAt: { gte: start, lt: end } } });
      await db.studentDay.create({ data: { studentId: s.user.student!.id, date: dateOnly(key), target: s.price.dailyTarget, applied } });
    }
  }

  // Leave requests and a mock interview.
  const casual = await db.leaveType.findUniqueOrThrow({ where: { name: "Casual" } });
  await db.leaveRequest.create({ data: { employeeId: employees[1]!.employee!.id, leaveTypeId: casual.id, fromDate: dateOnly(addDayKey(today, 9)), toDate: dateOnly(addDayKey(today, 10)), days: 2, reason: "Family function", status: "PENDING" } });
  await db.leaveRequest.create({ data: { employeeId: employees[2]!.employee!.id, leaveTypeId: casual.id, fromDate: dateOnly(addDayKey(today, -12)), toDate: dateOnly(addDayKey(today, -12)), days: 1, reason: "Personal errand", status: "APPROVED", decidedById: manager.id, decidedAt: new Date() } });
  await db.mockInterview.create({ data: { studentId: active[0]!.user.student!.id, conductedById: employees[0]!.id, scheduledAt: faker.date.soon({ days: 5 }), status: "SCHEDULED", focus: "Behavioural round (STAR)", meetingLink: "https://meet.example.com/mock-1" } });
  for (let k = 0; k < 4; k++) {
    await db.mockInterview.create({ data: { conductedById: employees[k % 3]!.id, scheduledAt: faker.date.soon({ days: 12 }), status: "OPEN", focus: faker.helpers.arrayElement(["SQL live coding", "Behavioural", "System design basics", "Case interview"]) } });
  }

  // Prep resources.
  const prep: [string, string, string[], string][] = [
    ["The STAR method, explained with examples", "ARTICLE", ["behavioural", "all"], "Structure every behavioural answer as Situation, Task, Action, Result. Keep the Result quantified."],
    ["SQL interview question bank", "QUESTION_BANK", ["data", "analyst", "engineer"], "Joins, window functions, aggregation and query optimisation questions with model answers."],
    ["Recruiter screen: what to expect", "ARTICLE", ["all"], "How to talk about salary, visa status and your timeline in the first call."],
    ["System design basics for product engineers", "VIDEO", ["engineer", "software"], "A 30-minute walkthrough of designing a URL shortener."],
  ];
  for (const [title, type, tags, text] of prep) {
    const { body, bodyHtml } = doc([text]);
    await db.prepResource.create({ data: { title, type, tags, marketCodes: ["US"], body, bodyHtml, isPublished: true, url: type === "VIDEO" ? "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" : null } });
  }

  // Leads + notifications.
  for (let k = 0; k < 5; k++) {
    await db.lead.create({ data: { name: faker.person.fullName(), email: faker.internet.email().toLowerCase(), phone: `+1415555${faker.string.numeric(4)}`, marketCode: "US", source: faker.helpers.arrayElement(["contact_form", "call_booking"]), message: faker.lorem.sentence(), createdAt: faker.date.recent({ days: 7 }) } });
  }
  await db.notification.create({ data: { userId: active[0]!.user.id, type: "assigned", title: "Your specialist is Arjun", body: "Arjun will start applying for you today.", link: "/app/messages" } });
  void admin;
}

async function main() {
  await seedReference();
  console.log("✓ Reference data (markets, styles, plans, leave types, settings, CMS)");
  await seedDemo();
  console.log("✓ Demo data");
  console.log(`\nDemo logins (password: ${DEMO_PASSWORD})\n  admin@upayaind.test · manager@upayaind.test · arjun@upayaind.test · student@upayaind.test\n  Staff 2FA secret (dev only): ${DEMO_TOTP_SECRET}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
