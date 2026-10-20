import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { setAiTransport, type TransportRequest } from "@/server/ai/client";
import {
  checkDuplicates,
  commitCsvImport,
  editApplication,
  markApplied,
  previewCsvImport,
  quickLog,
  reportOutcome,
  runNoResponseSweep,
  runTestimonialRequests,
  updateStatus,
  canTransition,
  getTodayCounter,
} from "@/server/services/applications";
import { tailorResume, updateVersionContent, getOrCreateBaseVersion, analyzeJd, jdHash, parseUploadedResume, saveParsedMasterProfile, canAccessVersion, ensureRendered } from "@/server/services/resumes";
import { makeEmployee, makeMarket, makeStudent, resetDb } from "../setup/db";
import { ANALYSIS, JD_TEXT, MASTER, clone } from "./resume-fixtures";

vi.mock("@/server/services/email", () => ({ sendEmail: vi.fn(async () => undefined) }));

type Ctx = Awaited<ReturnType<typeof setup>>;

async function setup(opts: { subscription?: "ACTIVE" | "PAST_DUE" | null; avoid?: string[] } = {}) {
  const market = await makeMarket();
  const emp = await makeEmployee(market.id, { name: "Arjun Rao" });
  const other = await makeEmployee(market.id, { name: "Divya Menon" });
  const stu = await makeStudent(market.id, "Priya Sharma");
  await db.studentProfile.update({ where: { id: stu.student.id }, data: { masterProfile: MASTER as unknown as Prisma.InputJsonValue, avoidCompanies: opts.avoid ?? ["Meridian Retail"] } });
  await db.assignment.create({ data: { studentId: stu.student.id, employeeId: emp.employee.id, source: "AUTO" } });
  const plan = await db.plan.create({ data: { code: `p${Date.now()}`, name: "Standard" } });
  const price = await db.planPrice.create({ data: { planId: plan.id, marketId: market.id, interval: "MONTHLY", amountMinor: 9900, currency: "USD", dailyTarget: 25 } });
  if (opts.subscription !== null) await db.subscription.create({ data: { studentId: stu.student.id, planPriceId: price.id, status: opts.subscription ?? "ACTIVE", provider: "MANUAL" } });
  const admin = await db.user.create({ data: { email: `admin${Date.now()}@t.test`, name: "Asha Admin", role: "ADMIN" } });
  const actor = { id: emp.user.id, role: "EMPLOYEE" as const, timezone: "Asia/Kolkata" };
  const outsider = { id: other.user.id, role: "EMPLOYEE" as const, timezone: "Asia/Kolkata" };
  const student = { id: stu.user.id, role: "STUDENT" as const, timezone: "America/New_York" };
  return { market, emp, other, stu, studentId: stu.student.id, actor, outsider, student, admin: { id: admin.id, role: "ADMIN" as const, timezone: "UTC" } };
}

const job = (c: Ctx, over: Record<string, unknown> = {}) => ({
  studentId: c.studentId,
  jobUrl: "https://www.linkedin.com/jobs/view/12345/?utm_source=x&trk=abc",
  companyName: "Northstar Bank",
  jobTitle: "Data Analyst",
  location: "Austin, TX",
  source: "LINKEDIN" as const,
  ...over,
});

/** Mock Anthropic transport: returns the queued tool inputs in order. */
function mockAi(...outputs: unknown[]) {
  const calls: TransportRequest[] = [];
  setAiTransport(async (req) => {
    calls.push(req);
    const input = outputs.length > 1 ? outputs.shift() : outputs[0];
    return { model: req.model, content: [{ type: "tool_use", name: req.tool_choice.name, input }], usage: { input_tokens: 1000, output_tokens: 500 } };
  });
  return calls;
}

beforeEach(async () => {
  await resetDb();
});
afterEach(() => setAiTransport(null));

describe("duplicate rules (F4)", () => {
  it("blocks the same normalised URL with date and first name", async () => {
    const c = await setup();
    const base = await getOrCreateBaseVersion(c.actor, c.studentId);
    await markApplied(c.actor, { ...job(c), resumeVersionId: base.id });
    const d = await checkDuplicates(c.actor, { studentId: c.studentId, jobUrl: "linkedin.com/jobs/view/12345?utm_campaign=y" });
    expect(d.block?.code).toBe("same_url");
    expect(d.block?.message).toMatch(/^Already applied on \d{1,2} [A-Z][a-z]{2} by Arjun\.$/);
    await expect(quickLog(c.actor, { ...job(c), jobUrl: "https://linkedin.com/jobs/view/12345" })).rejects.toThrow(/Already applied/);
  });

  it("warns on company + title trigram similarity ≥ 0.85 within 60 days and requires confirmation", async () => {
    const c = await setup();
    await quickLog(c.actor, { ...job(c), jobUrl: "https://jobs.example.com/a1" });
    const d = await checkDuplicates(c.actor, { studentId: c.studentId, jobUrl: "https://jobs.example.com/b2", companyName: "Northstar Bank", jobTitle: "Data Analyst " });
    expect(d.block).toBeNull();
    expect(d.warnings).toHaveLength(1);
    expect(d.warnings[0]!.similarity).toBeGreaterThanOrEqual(0.85);
    await expect(quickLog(c.actor, { ...job(c), jobUrl: "https://jobs.example.com/b2" })).rejects.toMatchObject({ code: "similar_needs_confirmation" });
    await expect(quickLog(c.actor, { ...job(c), jobUrl: "https://jobs.example.com/b2", confirmSimilar: true })).resolves.toHaveProperty("applicationId");
    // a clearly different role at the same company is not a warning
    const diff = await checkDuplicates(c.actor, { studentId: c.studentId, companyName: "Northstar Bank", jobTitle: "Senior Backend Engineer" });
    expect(diff.warnings).toEqual([]);
  });

  it("ignores similar applications older than 60 days", async () => {
    const c = await setup();
    const r = await quickLog(c.actor, { ...job(c), jobUrl: "https://jobs.example.com/old" });
    await db.jobApplication.update({ where: { id: r.applicationId }, data: { appliedAt: new Date(Date.now() - 61 * 86400e3) } });
    const d = await checkDuplicates(c.actor, { studentId: c.studentId, companyName: "Northstar Bank", jobTitle: "Data Analyst" });
    expect(d.warnings).toEqual([]);
  });

  it("blocks companies on the student's avoid list (normalised)", async () => {
    const c = await setup({ avoid: ["Meridian Retail", "Globex"] });
    const d = await checkDuplicates(c.actor, { studentId: c.studentId, companyName: "Meridian Retail, Inc." });
    expect(d.block?.code).toBe("avoid_company");
    await expect(quickLog(c.actor, { ...job(c), companyName: "GLOBEX LLC" })).rejects.toMatchObject({ code: "avoid_company" });
  });
});

describe("access control", () => {
  it("refuses an unassigned employee everywhere", async () => {
    const c = await setup();
    await expect(checkDuplicates(c.outsider, { studentId: c.studentId, jobUrl: "https://x.com/1" })).rejects.toThrow(/isn't assigned to you/);
    await expect(quickLog(c.outsider, job(c))).rejects.toThrow(/isn't assigned to you/);
    await expect(tailorResume(c.outsider, { studentId: c.studentId, jd: JD_TEXT, company: "A", title: "B" })).rejects.toThrow(/isn't assigned to you/);
    await expect(previewCsvImport(c.outsider, c.studentId, "job_url,company,title\n")).rejects.toThrow(/isn't assigned to you/);
    const r = await quickLog(c.actor, job(c));
    await expect(updateStatus(c.outsider, { applicationId: r.applicationId, to: "VIEWED" })).rejects.toThrow(/isn't assigned to you/);
  });

  it("loses access as soon as the assignment ends; admins keep access", async () => {
    const c = await setup();
    const r = await quickLog(c.actor, job(c));
    await db.assignment.updateMany({ where: { studentId: c.studentId }, data: { isActive: false, endsAt: new Date() } });
    await expect(updateStatus(c.actor, { applicationId: r.applicationId, to: "VIEWED" })).rejects.toThrow(/isn't assigned/);
    await expect(updateStatus(c.admin, { applicationId: r.applicationId, to: "VIEWED" })).resolves.toMatchObject({ status: "VIEWED" });
  });

  it("resume downloads: owner, assignee, the employee who logged it (even after reassignment), managers", async () => {
    const c = await setup();
    const base = await getOrCreateBaseVersion(c.actor, c.studentId);
    const v = { id: base.id, studentId: c.studentId };
    const other = await makeStudent(c.market.id, "Other");
    expect(await canAccessVersion(c.student, v)).toBe(true);
    expect(await canAccessVersion({ id: other.user.id, role: "STUDENT" }, v)).toBe(false);
    expect(await canAccessVersion(c.actor, v)).toBe(true);
    expect(await canAccessVersion(c.outsider, v)).toBe(false);
    expect(await canAccessVersion(c.admin, v)).toBe(true);
    expect(await canAccessVersion(null, v)).toBe(false);
    await markApplied(c.actor, { ...job(c), resumeVersionId: base.id });
    await db.assignment.updateMany({ where: { studentId: c.studentId }, data: { isActive: false, endsAt: new Date() } });
    expect(await canAccessVersion(c.actor, v)).toBe(true); // logged an application with it
    const other2 = await getOrCreateBaseVersion(c.admin, c.studentId);
    expect(other2.id).toBe(base.id); // unchanged master → same base version
  });

  it("renders on demand and caches the file key on the version", async () => {
    const c = await setup();
    const base = await getOrCreateBaseVersion(c.actor, c.studentId);
    const a = await ensureRendered(base.id, "pdf");
    expect(a.key).toBe(`students/${c.studentId}/resumes/${base.id}.pdf`);
    expect(a.filename).toMatch(/^Priya-Sharma_Resume_\d{4}-\d{2}-\d{2}\.pdf$/);
    expect((await db.resumeVersion.findUniqueOrThrow({ where: { id: base.id } })).pdfKey).toBe(a.key);
    const b = await ensureRendered(base.id, "pdf");
    expect("buffer" in b && b.buffer).toBeFalsy(); // cached
    const d = await ensureRendered(base.id, "docx");
    expect(d.filename.endsWith(".docx")).toBe(true);
  });

  it("students can only report on their own applications", async () => {
    const c = await setup();
    const r = await quickLog(c.actor, job(c));
    const other = await makeStudent(c.market.id, "Someone Else");
    await expect(reportOutcome({ id: other.user.id, role: "STUDENT" }, { applicationId: r.applicationId, kind: "offer" })).rejects.toThrow();
  });
});

describe("tailoring pipeline (mocked AI)", () => {
  it("analyses (cached), tailors, validates, scores and saves an unlocked TAILORED version", async () => {
    const c = await setup();
    const tailored = clone(MASTER);
    tailored.summary = "Data analyst who builds Looker and Tableau dashboards and SQL data pipelines.";
    tailored.skills = [{ group: "Analytics", items: ["SQL", "Tableau", "Looker", "Python", "dbt"] }];
    const calls = mockAi(ANALYSIS, tailored);
    const steps: string[] = [];
    const r = await tailorResume(c.actor, { studentId: c.studentId, jd: JD_TEXT, company: "Northstar Bank", title: "Data Analyst" }, (s) => void steps.push(s));
    expect(steps).toEqual(["analysing", "tailoring", "validating", "scoring", "rendering", "done"]);
    expect(r.validation.ok).toBe(true);
    expect(r.validation.attempts).toBe(1);
    expect(r.tailored.score).toBeGreaterThanOrEqual(r.base.score);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.tools[0]!.input_schema).toHaveProperty("properties.requiredSkills");
    expect(calls[1]!.system).toContain("TRUTHFULNESS RULES");
    expect(calls[1]!.system).toContain("at most 1 page");
    const v = await db.resumeVersion.findUniqueOrThrow({ where: { id: r.versionId } });
    expect(v).toMatchObject({ kind: "TAILORED", lockedAt: null, jdHash: jdHash(JD_TEXT), atsScore: r.tailored.score, atsScoreBase: r.base.score });
    expect(await db.aiUsage.count({ where: { studentId: c.studentId } })).toBe(2);
    expect(await db.jdAnalysisCache.count()).toBe(1);
    // second analysis of the same JD hits the cache (no new AI call)
    const again = await analyzeJd({ user: c.actor, studentId: c.studentId, jd: JD_TEXT, title: "x", company: "y", profileSkills: [] });
    expect(again.cached).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("retries once with the validator errors, then blocks Mark as applied if still invalid", async () => {
    const c = await setup();
    const bad = clone(MASTER);
    bad.experience[0]!.company = "Google";
    bad.skills[0]!.items.push("Kubernetes");
    const calls = mockAi(ANALYSIS, bad, bad);
    const r = await tailorResume(c.actor, { studentId: c.studentId, jd: JD_TEXT, company: "Northstar Bank", title: "Data Analyst" });
    expect(calls).toHaveLength(3); // analysis + tailor + retry
    expect(calls[2]!.messages[0]!.content).toContain("PREVIOUS ATTEMPT WAS REJECTED");
    expect(calls[2]!.messages[0]!.content).toContain('Company changed from "Northwind Analytics" to "Google"');
    expect(r.validation.ok).toBe(false);
    expect(r.validation.attempts).toBe(2);
    await expect(markApplied(c.actor, { ...job(c), resumeVersionId: r.versionId })).rejects.toMatchObject({ code: "validation_failed" });
    // fixing it in the editor unblocks it
    const fixed = await updateVersionContent(c.actor, r.versionId, MASTER);
    expect(fixed.validation.ok).toBe(true);
    await expect(markApplied(c.actor, { ...job(c), resumeVersionId: r.versionId })).resolves.toHaveProperty("applicationId");
  });

  it("re-asserts the student's identity even if the model changes contact details", async () => {
    const c = await setup();
    const out = clone(MASTER);
    out.basics.email = "hacker@evil.test";
    mockAi(ANALYSIS, out);
    const r = await tailorResume(c.actor, { studentId: c.studentId, jd: JD_TEXT, company: "N", title: "Data Analyst" });
    expect(r.content.basics.email).toBe(MASTER.basics.email);
  });

  it("without an API key: heuristic analysis + base resume, flagged", async () => {
    const c = await setup();
    const r = await tailorResume(c.actor, { studentId: c.studentId, jd: JD_TEXT, company: "N", title: "Data Analyst" });
    expect(r.aiUnavailable).toBe(true);
    expect(r.analysis.method).toBe("heuristic");
    expect(r.validation.ok).toBe(true);
    expect(await db.aiUsage.count()).toBe(0);
  });

  it("rejects JDs shorter than 200 characters", async () => {
    const c = await setup();
    await expect(tailorResume(c.actor, { studentId: c.studentId, jd: "Too short", company: "N", title: "T" })).rejects.toThrow(/at least 200/);
  });
});

describe("markApplied (F4 logging)", () => {
  it("creates APPLIED + event, locks the version, stores metadata and updates StudentDay", async () => {
    const c = await setup();
    mockAi(ANALYSIS, clone(MASTER));
    const t = await tailorResume(c.actor, { studentId: c.studentId, jd: JD_TEXT, company: "Northstar Bank", title: "Data Analyst" });
    const r = await markApplied(c.actor, { ...job(c), resumeVersionId: t.versionId, jdText: JD_TEXT, coverLetter: "Dear Hiring Team, …", proofText: "Thanks for applying!" });
    const app = await db.jobApplication.findUniqueOrThrow({ where: { id: r.applicationId }, include: { events: true } });
    expect(app).toMatchObject({ status: "APPLIED", employeeId: c.emp.employee.id, jobUrlNormalized: "https://linkedin.com/jobs/view/12345", jdText: JD_TEXT, coverLetter: "Dear Hiring Team, …", proofText: "Thanks for applying!", resumeVersionId: t.versionId });
    expect(app.events.map((e) => [e.fromStatus, e.toStatus])).toEqual([[null, "APPLIED"]]);
    const v = await db.resumeVersion.findUniqueOrThrow({ where: { id: t.versionId } });
    expect(v.lockedAt).not.toBeNull();
    expect(r.today).toEqual({ applied: 1, target: 25 });
    const day = await db.studentDay.findFirstOrThrow({ where: { studentId: c.studentId } });
    expect(day).toMatchObject({ applied: 1, target: 25 });
    expect(await getTodayCounter(c.studentId, "Asia/Kolkata")).toEqual({ applied: 1, target: 25 });
  });

  it("locked versions refuse edits afterwards", async () => {
    const c = await setup();
    mockAi(ANALYSIS, clone(MASTER));
    const t = await tailorResume(c.actor, { studentId: c.studentId, jd: JD_TEXT, company: "N", title: "Data Analyst" });
    await markApplied(c.actor, { ...job(c), resumeVersionId: t.versionId });
    const edited = clone(MASTER);
    edited.summary = "Changed after applying";
    await expect(updateVersionContent(c.actor, t.versionId, edited)).rejects.toThrow(/already used in an application/);
    const v = await db.resumeVersion.findUniqueOrThrow({ where: { id: t.versionId } });
    expect((v.content as { summary: string }).summary).toBe(MASTER.summary);
  });

  it("refuses when the subscription isn't ACTIVE", async () => {
    const c = await setup({ subscription: "PAST_DUE" });
    const base = await getOrCreateBaseVersion(c.actor, c.studentId);
    await expect(markApplied(c.actor, { ...job(c), resumeVersionId: base.id })).rejects.toMatchObject({ code: "inactive_subscription" });
    expect(await db.jobApplication.count()).toBe(0);
  });

  it("rejects a resume version of another student and a proof that isn't PNG/JPG", async () => {
    const c = await setup();
    const other = await makeStudent(c.market.id);
    const foreign = await db.resumeVersion.create({ data: { studentId: other.student.id, kind: "BASE", title: "x", content: MASTER as unknown as Prisma.InputJsonValue, styleCode: "US_STYLE", templateCode: "classic", createdById: c.actor.id } });
    await expect(markApplied(c.actor, { ...job(c), resumeVersionId: foreign.id })).rejects.toThrow(/doesn't belong/);
    const base = await getOrCreateBaseVersion(c.actor, c.studentId);
    await expect(markApplied(c.actor, { ...job(c), resumeVersionId: base.id }, { buffer: Buffer.from("%PDF-1.4 fake"), filename: "x.pdf" })).rejects.toThrow(/Unsupported file type/);
  });

  it("stores a PNG proof upload as a FileObject with purpose proof", async () => {
    const c = await setup();
    const base = await getOrCreateBaseVersion(c.actor, c.studentId);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    const r = await markApplied(c.actor, { ...job(c), resumeVersionId: base.id }, { buffer: png, filename: "proof.png" });
    const app = await db.jobApplication.findUniqueOrThrow({ where: { id: r.applicationId } });
    expect(app.proofKey).toMatch(/^students\/.+\/proof\/.+\.png$/);
    expect(await db.fileObject.count({ where: { purpose: "proof", studentId: c.studentId } })).toBe(1);
  });

  it("employees may edit their own entries within 7 days only", async () => {
    const c = await setup();
    const r = await quickLog(c.actor, job(c));
    await expect(editApplication(c.actor, { applicationId: r.applicationId, location: "Remote" })).resolves.toMatchObject({ companyName: "Northstar Bank" });
    await db.jobApplication.update({ where: { id: r.applicationId }, data: { createdAt: new Date(Date.now() - 8 * 86400e3) } });
    await expect(editApplication(c.actor, { applicationId: r.applicationId, location: "Austin" })).rejects.toThrow(/within 7 days/);
    await expect(editApplication(c.admin, { applicationId: r.applicationId, location: "Austin" })).resolves.toBeTruthy();
  });
});

describe("enforced working window (D-139)", () => {
  // Only Date is faked so Prisma/pg timers keep working.
  const at = (iso: string) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
  };
  afterEach(() => vi.useRealTimers());
  // 09:00–18:00 New York = 13:00Z–22:00Z on 12 Oct 2026 (Monday, EDT).
  const WINDOW = { days: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "18:00", timezone: "America/New_York", enforceWindow: true };

  async function windowed(enforceWindow = true) {
    const c = await setup();
    await db.employeeProfile.update({ where: { id: c.emp.employee.id }, data: { workSchedule: { ...WINDOW, enforceWindow } } });
    // The faked clock sits before the real "now" the assignment was created at; backdate it so it counts as active.
    await db.assignment.updateMany({ where: { studentId: c.studentId }, data: { startsAt: new Date("2026-10-01T00:00:00Z") } });
    return c;
  }

  it("refuses quick log outside the window and when not clocked in", async () => {
    const c = await windowed();
    at("2026-10-12T12:00:00Z"); // 08:00 New York
    await expect(quickLog(c.actor, job(c))).rejects.toMatchObject({ code: "outside_window", message: "You can only log applications while clocked in during your working window (09:00–18:00 America/New_York)." });
    at("2026-10-12T15:00:00Z"); // inside, but not clocked in
    await expect(quickLog(c.actor, job(c))).rejects.toMatchObject({ code: "outside_window" });
    expect(await db.jobApplication.count()).toBe(0);
    // CSV import goes through the same gate.
    await expect(commitCsvImport(c.actor, c.studentId, "job_url,company,title\nhttps://jobs.example.com/1,Acme,Analyst")).rejects.toMatchObject({ code: "outside_window" });
  });

  it("allows logging while clocked in inside the window; managers and admins are exempt", async () => {
    const c = await windowed();
    at("2026-10-12T15:00:00Z");
    await db.workSession.create({ data: { employeeId: c.emp.employee.id, startedAt: new Date("2026-10-12T13:05:00Z") } });
    await expect(quickLog(c.actor, job(c))).resolves.toHaveProperty("applicationId");
    at("2026-10-12T23:00:00Z"); // window closed; the session is still open
    await expect(quickLog(c.actor, { ...job(c), jobUrl: "https://jobs.example.com/late" })).rejects.toMatchObject({ code: "outside_window" });
    // Different employers so the similar-application rule stays out of the way.
    await expect(quickLog(c.admin, { ...job(c), jobUrl: "https://jobs.example.com/admin", companyName: "Acme Robotics" })).resolves.toHaveProperty("applicationId");
    const mgr = await db.user.create({ data: { email: `mgr${Date.now()}@t.test`, name: "Meena", role: "MANAGER", employee: { create: { employeeCode: `UPY-M${Date.now()}`, marketIds: [c.market.id], workSchedule: WINDOW } } } });
    await expect(quickLog({ id: mgr.id, role: "MANAGER", timezone: "UTC" }, { ...job(c), jobUrl: "https://jobs.example.com/mgr", companyName: "Globex Finance" })).resolves.toHaveProperty("applicationId");
    // Status updates are never gated.
    const r = await db.jobApplication.findFirstOrThrow({ where: { employeeId: c.emp.employee.id } });
    await expect(updateStatus(c.actor, { applicationId: r.id, to: "VIEWED" })).resolves.toMatchObject({ status: "VIEWED" });
  });

  it("ignores the window when it isn't enforced", async () => {
    const c = await windowed(false);
    at("2026-10-12T12:00:00Z");
    await expect(quickLog(c.actor, job(c))).resolves.toHaveProperty("applicationId");
  });
});

describe("CSV bulk import", () => {
  it("previews per-row errors and applies the duplicate rules, then imports valid rows", async () => {
    const c = await setup();
    await quickLog(c.actor, { ...job(c), jobUrl: "https://jobs.example.com/existing", companyName: "Initech", jobTitle: "BI Analyst" });
    const csv = [
      "job_url,company,title,location,source,applied_at,resume_version_id",
      "https://jobs.example.com/1,Acme,Data Analyst,Austin,LinkedIn,2026-10-01,",
      "https://jobs.example.com/existing?utm_source=a,Initech,BI Analyst,,Indeed,2026-10-02,",
      "not a url,,Analyst,,Carrier pigeon,someday,",
      "https://jobs.example.com/1,Acme,Data Analyst,,,,",
      "https://jobs.example.com/4,Meridian Retail,Analyst,,,,",
      "https://jobs.example.com/5,Initech,BI Analyst,,Company site,,",
    ].join("\n");
    const p = await previewCsvImport(c.actor, c.studentId, csv);
    expect(p.rows).toHaveLength(6);
    expect(p.rows[0]!.errors).toEqual([]);
    expect(p.rows[1]!.errors[0]).toMatch(/Already applied/);
    expect(p.rows[2]!.errors).toEqual(expect.arrayContaining([expect.stringMatching(/valid job URL/), "Company is required.", 'Unknown source "Carrier pigeon".', expect.stringMatching(/applied_at/)]));
    expect(p.rows[3]!.errors).toEqual(["Same job URL as row 1."]);
    expect(p.rows[4]!.errors[0]).toMatch(/avoid/);
    expect(p.rows[5]!.warnings[0]).toMatch(/Similar application/);
    expect(p.rows[5]!.source).toBe("COMPANY_SITE");

    const r1 = await commitCsvImport(c.actor, c.studentId, csv);
    expect(r1.imported).toBe(1);
    const r2 = await commitCsvImport(c.actor, c.studentId, csv, { confirmWarnings: true });
    expect(r2.imported).toBe(1); // row 1 is now a duplicate; only the confirmed similar row is added
    const imported = await db.jobApplication.findMany({ where: { studentId: c.studentId, companyName: "Acme" }, include: { events: true, resumeVersion: true } });
    expect(imported[0]!.events[0]!.note).toBe("CSV import");
    expect(imported[0]!.resumeVersion!.kind).toBe("BASE");
    expect(imported[0]!.resumeVersion!.lockedAt).not.toBeNull();
  });

  it("reports missing columns", async () => {
    const c = await setup();
    const p = await previewCsvImport(c.actor, c.studentId, "url,company\nx,y");
    expect(p.missingColumns).toEqual(["job_url", "title"]);
  });
});

describe("status lifecycle (F5)", () => {
  const interview = { scheduledAt: new Date(Date.now() + 3 * 86400e3).toISOString(), timezone: "America/New_York", round: "Technical" as const, mode: "Video" as const, meetingLink: "https://meet.example.com/x", interviewers: "Sam Lee", prepNotes: "SQL window functions" };

  it("enforces allowed transitions", async () => {
    expect(canTransition("APPLIED", "VIEWED")).toBe(true);
    expect(canTransition("HIRED", "APPLIED")).toBe(false);
    expect(canTransition("APPLIED", "HIRED")).toBe(false);
    const c = await setup();
    const r = await quickLog(c.actor, job(c));
    await expect(updateStatus(c.actor, { applicationId: r.applicationId, to: "HIRED" })).rejects.toMatchObject({ code: "invalid_transition" });
    // admins can override with a note
    await expect(updateStatus(c.admin, { applicationId: r.applicationId, to: "HIRED", force: true })).rejects.toThrow(/note/);
    await expect(updateStatus(c.admin, { applicationId: r.applicationId, to: "HIRED", force: true, note: "Confirmed by phone" })).resolves.toMatchObject({ status: "HIRED" });
  });

  it("INTERVIEW_SCHEDULED requires an Interview record; event + notification on change", async () => {
    const c = await setup();
    const r = await quickLog(c.actor, job(c));
    await expect(updateStatus(c.actor, { applicationId: r.applicationId, to: "INTERVIEW_SCHEDULED" })).rejects.toMatchObject({ code: "interview_required" });
    const ok = await updateStatus(c.actor, { applicationId: r.applicationId, to: "INTERVIEW_SCHEDULED", interview, note: "Recruiter emailed" });
    expect(ok.interviewId).toBeTruthy();
    const app = await db.jobApplication.findUniqueOrThrow({ where: { id: r.applicationId }, include: { events: { orderBy: { at: "asc" } }, interviews: true } });
    expect(app.status).toBe("INTERVIEW_SCHEDULED");
    expect(app.events.map((e) => e.toStatus)).toEqual(["APPLIED", "INTERVIEW_SCHEDULED"]);
    expect(app.events[1]).toMatchObject({ fromStatus: "APPLIED", byUserId: c.actor.id, note: "Recruiter emailed" });
    expect(app.interviews[0]).toMatchObject({ round: "Technical", mode: "Video", timezone: "America/New_York" });
    expect(await db.notification.count({ where: { userId: c.stu.user.id, type: "status_interview" } })).toBe(1);
  });

  it("OFFER notifies the student and admins; testimonial request goes out 7 days later, once", async () => {
    const c = await setup();
    const r = await quickLog(c.actor, job(c));
    await updateStatus(c.actor, { applicationId: r.applicationId, to: "INTERVIEW_SCHEDULED", interview });
    await updateStatus(c.actor, { applicationId: r.applicationId, to: "OFFER" });
    expect(await db.notification.count({ where: { userId: c.stu.user.id, type: "status_offer" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: c.admin.id, type: "offer_admin" } })).toBe(1);
    expect((await runTestimonialRequests()).sent).toBe(0); // too early
    const in8 = new Date(Date.now() + 8 * 86400e3);
    expect((await runTestimonialRequests(in8)).sent).toBe(1);
    expect((await runTestimonialRequests(in8)).sent).toBe(0); // only once
  });

  it("student self-report sets the status and notifies the employee to verify", async () => {
    const c = await setup();
    const r = await quickLog(c.actor, job(c));
    await expect(reportOutcome(c.student, { applicationId: r.applicationId, kind: "interview" })).rejects.toMatchObject({ code: "interview_required" });
    await reportOutcome(c.student, { applicationId: r.applicationId, kind: "interview", interview });
    const app = await db.jobApplication.findUniqueOrThrow({ where: { id: r.applicationId }, include: { events: { orderBy: { at: "asc" } } } });
    expect(app.status).toBe("INTERVIEW_SCHEDULED");
    expect(app.events[1]!.note).toMatch(/^Reported by student/);
    const n = await db.notification.findFirstOrThrow({ where: { userId: c.emp.user.id, type: "status_update_employee" } });
    expect(n.body).toContain("please verify");
    await reportOutcome(c.student, { applicationId: r.applicationId, kind: "offer", note: "Verbal offer" });
    expect((await db.jobApplication.findUniqueOrThrow({ where: { id: r.applicationId } })).status).toBe("OFFER");
  });

  it("nightly NO_RESPONSE sweep moves stale APPLIED/VIEWED applications", async () => {
    const c = await setup();
    const old = await quickLog(c.actor, { ...job(c), jobUrl: "https://j.example.com/old", companyName: "Old Co" });
    const viewed = await quickLog(c.actor, { ...job(c), jobUrl: "https://j.example.com/viewed", companyName: "Viewed Co" });
    const fresh = await quickLog(c.actor, { ...job(c), jobUrl: "https://j.example.com/new", companyName: "New Co" });
    const replied = await quickLog(c.actor, { ...job(c), jobUrl: "https://j.example.com/replied", companyName: "Replied Co" });
    await updateStatus(c.actor, { applicationId: viewed.applicationId, to: "VIEWED" });
    await updateStatus(c.actor, { applicationId: replied.applicationId, to: "RECRUITER_REPLIED" });
    const longAgo = new Date(Date.now() - 31 * 86400e3);
    await db.jobApplication.updateMany({ where: { id: { in: [old.applicationId, viewed.applicationId, replied.applicationId] } }, data: { lastStatusAt: longAgo } });
    const r = await runNoResponseSweep();
    expect(r.updated).toBe(2);
    const statuses = Object.fromEntries((await db.jobApplication.findMany({ select: { id: true, status: true } })).map((a) => [a.id, a.status]));
    expect(statuses[old.applicationId]).toBe("NO_RESPONSE");
    expect(statuses[viewed.applicationId]).toBe("NO_RESPONSE");
    expect(statuses[fresh.applicationId]).toBe("APPLIED");
    expect(statuses[replied.applicationId]).toBe("RECRUITER_REPLIED");
    const ev = await db.applicationEvent.findFirstOrThrow({ where: { applicationId: old.applicationId, toStatus: "NO_RESPONSE" } });
    expect(ev).toMatchObject({ fromStatus: "APPLIED", note: "Auto: no response after 30 days", byUserId: null });
    // respects the admin setting
    await db.setting.create({ data: { key: "noResponseDays", value: 60 } });
    await db.jobApplication.update({ where: { id: fresh.applicationId }, data: { lastStatusAt: longAgo } });
    expect((await runNoResponseSweep()).updated).toBe(0);
  });
});

describe("resume parsing for onboarding", () => {
  it("parses with the AI and saves master profile + MASTER_UPLOAD version", async () => {
    const c = await setup();
    mockAi({
      basics: { name: "Priya Sharma", email: "priya@example.com", phone: "+1 415 555 0101", location: { city: "Austin", region: "TX", country: "United States" }, links: [{ label: "LinkedIn", url: "linkedin.com/in/priya" }] },
      skills: [{ group: "Core", items: ["SQL", "Python"] }],
      experience: [{ company: "Northwind Analytics", title: "Data Analyst", startDate: "Feb 2023", endDate: null, bullets: ["Built dashboards."], technologies: ["Tableau"] }],
      education: [{ institution: "UT Austin", degree: "B.S.", field: "Statistics", endDate: "2021" }],
    });
    const text = Buffer.from(`Priya Sharma\npriya@example.com\n${"Experienced data analyst. ".repeat(10)}`);
    const r = await parseUploadedResume(c.studentId, { buffer: text }, "text/plain");
    expect(r.method).toBe("ai");
    expect(r.resume.experience[0]).toMatchObject({ id: "exp_1", startDate: "2023-02", endDate: null, bullets: [{ id: "exp_1_b1", text: "Built dashboards." }] });
    expect(r.resume.basics.links[0]!.url).toBe("https://linkedin.com/in/priya");
    const v = await saveParsedMasterProfile({ studentId: c.studentId, result: r, originalFileKey: "students/x/resume.pdf", createdById: c.stu.user.id });
    const sp = await db.studentProfile.findUniqueOrThrow({ where: { id: c.studentId } });
    expect((sp.masterProfile as { basics: { name: string } }).basics.name).toBe("Priya Sharma");
    expect(await db.resumeVersion.findUniqueOrThrow({ where: { id: v.id } })).toMatchObject({ kind: "MASTER_UPLOAD", originalFileKey: "students/x/resume.pdf" });
  });

  it("falls back to the heuristic parser without an API key", async () => {
    const c = await setup();
    const text = Buffer.from("Priya Sharma\npriya@example.com | (415) 555-0101\n\nEXPERIENCE\nData Analyst | Northwind Analytics\nFeb 2023 - Present\n• Built Tableau dashboards for the growth team every week.\n\nEDUCATION\nUniversity of Texas\nB.S. in Statistics 2021\n");
    const r = await parseUploadedResume(c.studentId, { buffer: text }, "text/plain");
    expect(r.method).toBe("heuristic");
    expect(r.warnings[0]).toMatch(/without AI/);
    expect(r.resume.experience[0]).toMatchObject({ company: "Northwind Analytics", title: "Data Analyst", startDate: "2023-02" });
  });
});
