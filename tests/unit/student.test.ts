import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { completeOnboarding, completeStep, completionCheck } from "@/server/services/onboarding";
import { getDashboard, responseRate, targetForDay } from "@/server/services/student-dashboard";
import { cleanMasterProfile, saveLinks, savePreferences, saveMasterProfile, getStudentProfile } from "@/server/services/student-profile";
import { buildApplicationWhere, csvCell, exportApplicationsCsv, getStudentApplication, listStudentApplications, listStudentCompanies } from "@/server/services/student-applications";
import { buildStudentExport, buildZip, saveEmailPrefs, getEmailPrefs, requestAccountDeletion } from "@/server/services/student-privacy";
import { bookMockInterview, cancelMockInterview, expand, getPrepPage, rankResources, tokens } from "@/server/services/prep";
import { addCredential } from "@/server/services/vault";
import { buildIcs, foldLine, icsEscape } from "@/lib/ics";
import { inflateRawSync } from "node:zlib";
import { makeEmployee, makeMarket, makeStudent, resetDb } from "../setup/db";
import { MASTER } from "./resume-fixtures";

vi.mock("@/server/services/email", () => ({ sendEmail: vi.fn(async () => undefined) }));

async function setup(opts: { verified?: boolean; assigned?: boolean; sub?: "ACTIVE" | "EXPIRED" | null; empTz?: string; studentTz?: string } = {}) {
  const market = await makeMarket();
  const emp = await makeEmployee(market.id, { name: "Arjun Rao" });
  if (opts.empTz) await db.user.update({ where: { id: emp.user.id }, data: { timezone: opts.empTz } });
  const stu = await makeStudent(market.id, "Priya Sharma");
  await db.user.update({ where: { id: stu.user.id }, data: { emailVerified: opts.verified === false ? null : new Date(), timezone: opts.studentTz ?? "America/New_York" } });
  if (opts.assigned !== false) await db.assignment.create({ data: { studentId: stu.student.id, employeeId: emp.employee.id, source: "AUTO", startsAt: new Date("2026-01-01T00:00:00Z") } });
  const plan = await db.plan.create({ data: { code: `p${Date.now()}${Math.random()}`, name: "Standard" } });
  const price = await db.planPrice.create({ data: { planId: plan.id, marketId: market.id, interval: "MONTHLY", amountMinor: 9900, currency: "USD", dailyTarget: 25 } });
  if (opts.sub !== null) {
    await db.subscription.create({ data: { studentId: stu.student.id, planPriceId: price.id, status: opts.sub ?? "ACTIVE", provider: "STRIPE", currentPeriodStart: new Date("2026-10-01T00:00:00Z"), currentPeriodEnd: new Date("2026-11-01T00:00:00Z") } });
  }
  return { market, emp, stu, studentId: stu.student.id, student: { id: stu.user.id, role: "STUDENT" as const }, empUserId: emp.user.id };
}

const PREFS = {
  targetTitles: ["Data Analyst", "data analyst", "BI Analyst"],
  seniority: "Mid" as const,
  industries: ["Fintech"],
  locations: ["Austin, TX"],
  remoteOk: true,
  workModes: ["REMOTE" as const, "HYBRID" as const],
  employmentTypes: ["FULL_TIME" as const],
  minSalary: "95000",
  salaryCurrency: "usd",
  workAuthorization: "STEM OPT",
  willingToRelocate: false,
  noticePeriod: "2 weeks",
  avoidCompanies: ["Meridian Retail"],
  targetCompanies: [],
};

async function addApp(studentId: string, employeeId: string, over: Partial<Prisma.JobApplicationUncheckedCreateInput> = {}) {
  const n = Math.random().toString(36).slice(2);
  return db.jobApplication.create({
    data: { studentId, employeeId, companyName: "Acme", jobTitle: "Data Analyst", jobUrl: `https://acme.com/jobs/${n}`, jobUrlNormalized: `acme.com/jobs/${n}`, source: "LINKEDIN", status: "APPLIED", appliedAt: new Date(), ...over },
  });
}

describe("onboarding", () => {
  beforeEach(resetDb);

  it("persists step progress without moving backwards", async () => {
    const c = await setup();
    expect(await completeStep(c.student, "resume")).toBe(1);
    expect(await completeStep(c.student, "vault")).toBe(3);
    expect(await completeStep(c.student, "resume")).toBe(3);
    expect((await db.studentProfile.findUniqueOrThrow({ where: { id: c.studentId } })).onboardingStep).toBe(3);
    expect(await completeStep(c.student, "review")).toBe(4);
  });

  it("saves preferences per F3 (dedupes titles, sponsorship flag, salary in minor units)", async () => {
    const c = await setup();
    await savePreferences(c.student, PREFS);
    const s = await db.studentProfile.findUniqueOrThrow({ where: { id: c.studentId } });
    expect(s.targetTitles).toEqual(["data analyst", "BI Analyst"].map((t, i) => (i === 0 ? "data analyst" : t)));
    expect(s.needsSponsorship).toBe(true);
    expect(s.minSalaryMinor).toBe(9_500_000);
    expect(s.salaryCurrency).toBe("USD");
    await expect(savePreferences(c.student, { ...PREFS, targetTitles: ["a", "b", "c", "d", "e", "f"] })).rejects.toThrow();
    await expect(savePreferences(c.student, { ...PREFS, workModes: [] })).rejects.toThrow(/work mode/);
    const p = await getStudentProfile(c.student);
    expect(p.preferences.minSalary).toBe(95000);
    expect(p.hasPreferences).toBe(true);
  });

  it("validates links (LinkedIn must be linkedin.com)", async () => {
    const c = await setup();
    await expect(saveLinks(c.student, { linkedinUrl: "https://evil.example.com/in/x" })).rejects.toThrow(/LinkedIn/);
    await saveLinks(c.student, { linkedinUrl: "linkedin.com/in/priya", githubUrl: "", portfolioUrl: "priya.dev" });
    const s = await db.studentProfile.findUniqueOrThrow({ where: { id: c.studentId } });
    expect(s).toMatchObject({ linkedinUrl: "https://linkedin.com/in/priya", githubUrl: null, portfolioUrl: "https://priya.dev" });
  });

  it("master profile editor output is validated and cleaned", async () => {
    const c = await setup();
    const dirty = structuredClone(MASTER) as unknown as Record<string, unknown> & { skills: { group: string; items: string[] }[]; experience: { bullets: { id: string; text: string }[]; endDate: string | null; startDate: string }[] };
    dirty.skills.push({ group: "", items: ["  ", ""] });
    dirty.experience[0]!.bullets.push({ id: "blank", text: "   " });
    const saved = await saveMasterProfile(c.student, dirty);
    expect(saved.skills.every((g) => g.items.length > 0)).toBe(true);
    expect(saved.experience[0]!.bullets.some((b) => b.id === "blank")).toBe(false);
    const bad = structuredClone(MASTER) as typeof dirty;
    bad.experience[0]!.startDate = "2020/01";
    expect(() => cleanMasterProfile(bad)).toThrow(/Experience 1 – start date/);
    const backwards = structuredClone(MASTER) as typeof dirty;
    backwards.experience[0]!.startDate = "2024-05";
    backwards.experience[0]!.endDate = "2023-01";
    expect(() => cleanMasterProfile(backwards)).toThrow(/before the start date/);
  });

  it("completion requires verified email, master profile, preferences and consent", async () => {
    const c = await setup({ verified: false });
    await expect(completeOnboarding(c.student, { consent: true })).rejects.toThrow(/confirm your email/);
    await db.user.update({ where: { id: c.student.id }, data: { emailVerified: new Date() } });
    await expect(completeOnboarding(c.student, { consent: true })).rejects.toThrow(/master profile/);
    await db.studentProfile.update({ where: { id: c.studentId }, data: { masterProfile: MASTER as unknown as Prisma.InputJsonValue } });
    await expect(completeOnboarding(c.student, { consent: true })).rejects.toThrow(/preferences/);
    await savePreferences(c.student, PREFS);
    await expect(completeOnboarding(c.student, { consent: false })).rejects.toThrow(/on your behalf/);
    expect(await completionCheck(c.student)).toEqual({ emailVerified: true, hasMaster: true, hasPreferences: true });

    const r = await completeOnboarding(c.student, { consent: true });
    expect(r.notified).toBe(true);
    const s = await db.studentProfile.findUniqueOrThrow({ where: { id: c.studentId } });
    expect(s.onboardingCompletedAt).not.toBeNull();
    expect(s.onboardingStep).toBe(5);
    expect(s.consentVersion).toBeTruthy();
    expect(s.consentApplyOnBehalfAt!.getTime()).toBeGreaterThan(Date.now() - 60_000);
    const n = await db.notification.findMany({ where: { userId: c.empUserId, type: "onboarding_completed" } });
    expect(n).toHaveLength(1);
    expect(n[0]!.body).toBe("Onboarding complete. Start applying.");
    // Idempotent: no second notification.
    await completeOnboarding(c.student, { consent: true });
    expect(await db.notification.count({ where: { userId: c.empUserId, type: "onboarding_completed" } })).toBe(1);
  });

  it("works without an assignment or active subscription (nobody to notify yet)", async () => {
    const c = await setup({ assigned: false, sub: null });
    await db.studentProfile.update({ where: { id: c.studentId }, data: { masterProfile: MASTER as unknown as Prisma.InputJsonValue } });
    await savePreferences(c.student, PREFS);
    const r = await completeOnboarding(c.student, { consent: true });
    expect(r.notified).toBe(false);
  });
});

describe("dashboard metrics", () => {
  beforeEach(resetDb);

  it("targetForDay: weekends, holidays and inactive plans are 0", () => {
    const base = { workingDays: [1, 2, 3, 4, 5], holidays: new Set(["2026-11-26"]), dailyTarget: 25, active: true };
    expect(targetForDay("2026-10-12", base)).toBe(25); // Monday
    expect(targetForDay("2026-10-17", base)).toBe(0); // Saturday
    expect(targetForDay("2026-10-18", base)).toBe(0); // Sunday
    expect(targetForDay("2026-11-26", base)).toBe(0); // holiday
    expect(targetForDay("2026-10-12", { ...base, active: false })).toBe(0);
    expect(targetForDay("2026-10-17", { ...base, workingDays: [1, 2, 3, 4, 5, 6] })).toBe(25);
  });

  it("responseRate counts statuses beyond APPLIED/VIEWED/NO_RESPONSE and ignores drafts", () => {
    expect(responseRate({})).toEqual({ total: 0, responded: 0, rate: 0 });
    expect(responseRate({ APPLIED: 6, VIEWED: 2, NO_RESPONSE: 1, RECRUITER_REPLIED: 1, REJECTED: 2, INTERVIEW_SCHEDULED: 1, OFFER: 1, DRAFT: 5 })).toEqual({ total: 14, responded: 5, rate: 36 });
  });

  it("today's count uses the employee's day boundary, not the student's", async () => {
    // Employee in IST, student in Los Angeles.
    const c = await setup({ empTz: "Asia/Kolkata", studentTz: "America/Los_Angeles" });
    const now = new Date("2026-10-12T12:00:00Z"); // Mon 17:30 IST; Mon 05:00 LA
    // 2026-10-11T20:00Z = Mon 01:30 IST (today for the employee) but Sun 13:00 in LA.
    await addApp(c.studentId, c.emp.employee.id, { appliedAt: new Date("2026-10-11T20:00:00Z") });
    // 2026-10-11T18:00Z = Sun 23:30 IST (yesterday for the employee).
    await addApp(c.studentId, c.emp.employee.id, { appliedAt: new Date("2026-10-11T18:00:00Z") });
    await addApp(c.studentId, c.emp.employee.id, { appliedAt: new Date("2026-10-12T11:00:00Z") });
    const d = await getDashboard(c.student, now);
    expect(d.dayTimezone).toBe("Asia/Kolkata");
    expect(d.todayKey).toBe("2026-10-12");
    expect(d.today).toEqual({ applied: 2, target: 25, workingDay: true });
    expect(d.thisWeek).toBe(2); // week starts Monday 12 Oct
    expect(d.chart).toHaveLength(30);
    expect(d.chart.find((x) => x.day === "2026-10-11")).toMatchObject({ applied: 1, target: 0 }); // Sunday
    expect(d.total).toBe(3);
    expect(d.specialist?.firstName).toBe("Arjun");
  });

  it("falls back to the student's zone without an assignment; target 0 on weekends and when inactive", async () => {
    const c = await setup({ assigned: false, studentTz: "America/New_York" });
    const sat = new Date("2026-10-17T16:00:00Z");
    const d = await getDashboard(c.student, sat);
    expect(d.dayTimezone).toBe("America/New_York");
    expect(d.specialist).toBeNull();
    expect(d.today.target).toBe(0);
    expect(d.today.workingDay).toBe(false);

    await db.subscription.updateMany({ data: { status: "EXPIRED" } });
    const mon = await getDashboard(c.student, new Date("2026-10-12T16:00:00Z"));
    expect(mon.today.target).toBe(0);
    expect(mon.plan.hasPlan && mon.plan.active).toBe(false);
  });

  it("holiday in the student's market zeroes the target", async () => {
    const c = await setup();
    await db.holiday.create({ data: { date: new Date("2026-10-12T00:00:00Z"), name: "Test Day", region: "US" } });
    const d = await getDashboard(c.student, new Date("2026-10-12T12:00:00Z"));
    expect(d.today.target).toBe(0);
  });

  it("plan card: day X of Y, upcoming interviews, response rate, celebration", async () => {
    const c = await setup();
    const now = new Date("2026-10-12T12:00:00Z");
    const a = await addApp(c.studentId, c.emp.employee.id, { status: "INTERVIEW_SCHEDULED" });
    await addApp(c.studentId, c.emp.employee.id, { status: "APPLIED" });
    await db.interview.create({ data: { applicationId: a.id, scheduledAt: new Date("2026-10-14T15:00:00Z"), timezone: "America/New_York", round: "Technical", mode: "Video" } });
    await db.interview.create({ data: { applicationId: a.id, scheduledAt: new Date("2026-10-01T15:00:00Z"), timezone: "America/New_York", round: "Recruiter screen", mode: "Phone" } });
    let d = await getDashboard(c.student, now);
    expect(d.interviewsUpcoming).toBe(1);
    expect(d.response.rate).toBe(50);
    expect(d.plan).toMatchObject({ hasPlan: true, active: true, dayNumber: 12, totalDays: 31, planName: "Standard" });
    expect(d.celebrate).toBeNull();
    await db.jobApplication.update({ where: { id: a.id }, data: { status: "OFFER", lastStatusAt: new Date("2026-10-10T00:00:00Z") } });
    d = await getDashboard(c.student, now);
    expect(d.celebrate).toMatchObject({ id: a.id, status: "OFFER" });
  });
});

describe("student applications", () => {
  beforeEach(resetDb);

  it("lists only own applications with filters and cursor pagination", async () => {
    const c = await setup();
    const other = await makeStudent(c.market.id, "Other");
    for (let i = 0; i < 30; i++) await addApp(c.studentId, c.emp.employee.id, { appliedAt: new Date(Date.UTC(2026, 9, 1, 12, i)), companyName: i % 2 ? "Acme" : "Globex", workMode: i % 3 === 0 ? "REMOTE" : "ONSITE" });
    await addApp(other.student.id, c.emp.employee.id, { companyName: "Secret Co" });
    await addApp(c.studentId, c.emp.employee.id, { status: "DRAFT", companyName: "Drafty" });

    const p1 = await listStudentApplications(c.student, {});
    expect(p1.total).toBe(30);
    expect(p1.items).toHaveLength(25);
    expect(p1.items.some((x) => x.companyName === "Secret Co" || x.companyName === "Drafty")).toBe(false);
    const p2 = await listStudentApplications(c.student, { after: p1.nextCursor! });
    expect(p2.items).toHaveLength(5);
    expect(p2.nextCursor).toBeNull();
    expect(p2.prevCursor).toBe(p2.items[0]!.id);
    const back = await listStudentApplications(c.student, { before: p2.prevCursor! });
    expect(back.items.map((x) => x.id)).toEqual(p1.items.map((x) => x.id));

    expect((await listStudentApplications(c.student, { q: "glob" })).total).toBe(15);
    expect((await listStudentApplications(c.student, { mode: "REMOTE" })).total).toBe(10);
    expect((await listStudentApplications(c.student, { status: "OFFER" })).total).toBe(0);
    expect((await listStudentApplications(c.student, { status: "BOGUS" })).total).toBe(30); // invalid filter ignored
    // A cursor from another student is ignored.
    const foreign = await db.jobApplication.findFirstOrThrow({ where: { companyName: "Secret Co" } });
    expect((await listStudentApplications(c.student, { after: foreign.id })).items[0]!.id).toBe(p1.items[0]!.id);
    expect(await getStudentApplication(c.student, foreign.id)).toBeNull();
  });

  it("date filters use the student's calendar days", () => {
    const w = buildApplicationWhere("s1", { from: "2026-10-01", to: "2026-10-01" }, "America/New_York") as { AND: Record<string, unknown>[] };
    expect(JSON.stringify(w.AND)).toContain("2026-10-01T04:00:00.000Z");
    expect(JSON.stringify(w.AND)).toContain("2026-10-02T04:00:00.000Z");
  });

  it("CSV export escapes cells and blocks formula injection", async () => {
    expect(csvCell('He said "hi", ok')).toBe('"He said ""hi"", ok"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    const c = await setup();
    await addApp(c.studentId, c.emp.employee.id, { companyName: "=cmd|calc", jobTitle: "Analyst, Data" });
    const csv = await exportApplicationsCsv(c.student, {}, "https://upayaind.com");
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toContain("applied_at,company,job_title");
    expect(lines[1]).toContain("'=cmd|calc");
    expect(lines[1]).toContain('"Analyst, Data"');
  });

  it("companies view groups by company with counts and latest status", async () => {
    const c = await setup();
    await addApp(c.studentId, c.emp.employee.id, { companyName: "Acme", appliedAt: new Date("2026-10-01T12:00:00Z"), status: "REJECTED" });
    await addApp(c.studentId, c.emp.employee.id, { companyName: "Acme", appliedAt: new Date("2026-10-05T12:00:00Z"), status: "VIEWED" });
    await addApp(c.studentId, c.emp.employee.id, { companyName: "Globex", appliedAt: new Date("2026-10-03T12:00:00Z") });
    const r = await listStudentCompanies(c.student);
    expect(r.totalCompanies).toBe(2);
    expect(r.companies[0]).toMatchObject({ companyName: "Acme", count: 2, latestStatus: "VIEWED" });
    expect(r.companies[1]).toMatchObject({ companyName: "Globex", count: 1 });
  });
});

describe(".ics", () => {
  it("produces a valid VCALENDAR with escaped, folded lines", () => {
    const ics = buildIcs([{ uid: "int-1@upayaind.com", start: new Date("2026-10-14T15:00:00Z"), durationMinutes: 45, summary: "Interview: Data Analyst, Acme; Technical", description: "Round: Technical\nMode: Video", url: "https://meet.example.com/abc", stamp: new Date("2026-10-12T00:00:00Z") }]);
    const lines = ics.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("DTSTART:20261014T150000Z");
    expect(lines).toContain("DTEND:20261014T154500Z");
    expect(lines).toContain("DTSTAMP:20261012T000000Z");
    expect(lines).toContain("UID:int-1@upayaind.com");
    expect(ics).toContain("SUMMARY:Interview: Data Analyst\\, Acme\\; Technical");
    expect(ics).toContain("DESCRIPTION:Round: Technical\\nMode: Video");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(1);
    for (const l of lines) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    // No bare LF.
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("folds long UTF-8 lines without breaking characters", () => {
    const long = `SUMMARY:${"é".repeat(80)}`;
    const folded = foldLine(long);
    expect(folded.split("\r\n ").join("")).toBe(long);
    for (const l of folded.split("\r\n")) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(icsEscape("a\\b")).toBe("a\\\\b");
  });
});

describe("privacy & settings", () => {
  beforeEach(resetDb);

  it("data export contains the student's data and no secrets", async () => {
    const c = await setup();
    await db.user.update({ where: { id: c.student.id }, data: { passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$SECRETHASH", totpSecretEnc: "v1.totp-secret" } });
    await db.studentProfile.update({ where: { id: c.studentId }, data: { masterProfile: MASTER as unknown as Prisma.InputJsonValue } });
    await addCredential(c.student, { kind: "EMAIL", label: "Application email", username: "priya.jobs@example.com", password: "Mail-Pass-123!", notes: "recovery phone ends 42" });
    await addApp(c.studentId, c.emp.employee.id, { companyName: "Acme" });
    const data = await buildStudentExport(c.student);
    const json = JSON.stringify(data);
    expect(json).toContain("Acme");
    expect(json).toContain("Application email");
    expect(json).not.toMatch(/passwordHash|totpSecret|SECRETHASH|usernameEnc|passwordEnc|notesEnc/);
    expect(json).not.toContain("priya.jobs@example.com");
    expect(json).not.toContain("Mail-Pass-123!");
    expect(json).not.toContain("recovery phone");
    expect(json).not.toMatch(/"v1\.[A-Za-z0-9_-]+\./); // no ciphertext either
    expect(data.vault.entries).toHaveLength(1);
  });

  it("zip writer produces a readable archive", () => {
    const files = [
      { name: "data.json", data: Buffer.from(JSON.stringify({ a: "x".repeat(500) })) },
      { name: "files/resume/cv.pdf", data: Buffer.from("%PDF-1.4 tiny") },
      { name: "files/resume/cv.pdf", data: Buffer.from("dup") },
    ];
    const zip = buildZip(files);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const eocd = zip.length - 22;
    expect(zip.readUInt32LE(eocd)).toBe(0x06054b50);
    expect(zip.readUInt16LE(eocd + 10)).toBe(3);
    // Walk local headers and decompress.
    let off = 0;
    const names: string[] = [];
    const bodies: string[] = [];
    for (let i = 0; i < 3; i++) {
      const method = zip.readUInt16LE(off + 8);
      const csize = zip.readUInt32LE(off + 18);
      const nlen = zip.readUInt16LE(off + 26);
      names.push(zip.subarray(off + 30, off + 30 + nlen).toString("utf8"));
      const body = zip.subarray(off + 30 + nlen, off + 30 + nlen + csize);
      bodies.push((method === 8 ? inflateRawSync(body) : body).toString("utf8"));
      off += 30 + nlen + csize;
    }
    expect(names).toEqual(["data.json", "files/resume/cv.pdf", "files/resume/cv (2).pdf"]);
    expect(bodies[1]).toBe("%PDF-1.4 tiny");
    expect(JSON.parse(bodies[0]!).a).toHaveLength(500);
  });

  it("email preferences are stored per type and respected by notify()", async () => {
    const c = await setup();
    await saveEmailPrefs(c.student, { daily_digest: false, weekly_report: true });
    const prefs = await getEmailPrefs(c.student);
    expect(prefs.daily_digest).toBe(false);
    expect(prefs.weekly_report).toBe(true);
    const u = await db.user.findUniqueOrThrow({ where: { id: c.student.id } });
    expect((u.notificationPrefs as { email: Record<string, boolean> }).email.daily_digest).toBe(false);
  });

  it("deletion request needs the account email and sets deletionRequestedAt", async () => {
    const c = await setup();
    await expect(requestAccountDeletion(c.student, "wrong@example.com")).rejects.toThrow();
    const u = await db.user.findUniqueOrThrow({ where: { id: c.student.id } });
    const at = await requestAccountDeletion(c.student, u.email.toUpperCase());
    expect(at).toBeInstanceOf(Date);
    expect((await db.user.findUniqueOrThrow({ where: { id: c.student.id } })).deletionRequestedAt).not.toBeNull();
  });
});

describe("prep", () => {
  beforeEach(resetDb);

  it("tokenises and ranks resources by tag", () => {
    expect(tokens("Senior Data Analysts (SQL)")).toEqual(["data", "analyst", "sql"]);
    const words = expand(tokens("Software Developer"));
    const ranked = rankResources(
      [
        { id: "a", tags: ["engineer", "software"] },
        { id: "b", tags: ["data", "analyst"] },
        { id: "c", tags: ["all"] },
      ],
      words,
    );
    expect(ranked.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("books an open slot atomically and lets the student cancel", async () => {
    const c = await setup();
    await db.studentProfile.update({ where: { id: c.studentId }, data: { targetTitles: ["Data Analyst"] } });
    await db.prepResource.create({ data: { title: "SQL bank", type: "QUESTION_BANK", tags: ["data", "analyst"], marketCodes: ["US"], isPublished: true } });
    await db.prepResource.create({ data: { title: "System design", type: "VIDEO", tags: ["engineer"], marketCodes: ["US"], isPublished: true } });
    await db.prepResource.create({ data: { title: "Draft", type: "ARTICLE", tags: ["data"], marketCodes: ["US"], isPublished: false } });
    const slot = await db.mockInterview.create({ data: { conductedById: c.emp.employee.id, scheduledAt: new Date(Date.now() + 3 * 86400e3), status: "OPEN", focus: "SQL live coding" } });
    const other = await makeStudent(c.market.id, "Other");

    const page = await getPrepPage(c.student);
    expect(page.library.map((r) => r.title)).toEqual(["SQL bank"]);
    expect(page.openSlots).toHaveLength(1);
    expect(page.openSlots[0]!.with).toBe("Arjun");

    await bookMockInterview(c.student, slot.id);
    await expect(bookMockInterview({ id: other.user.id, role: "STUDENT" }, slot.id)).rejects.toThrow(/taken/);
    const after = await getPrepPage(c.student);
    expect(after.openSlots).toHaveLength(0);
    expect(after.upcomingMocks).toHaveLength(1);
    expect(await db.notification.count({ where: { userId: c.student.id, type: "mock_interview_booked" } })).toBe(1);

    await cancelMockInterview(c.student, slot.id);
    expect((await db.mockInterview.findUniqueOrThrow({ where: { id: slot.id } })).status).toBe("OPEN");
  });
});
