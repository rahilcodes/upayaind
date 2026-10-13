import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { digestDue, runDailyDigest, runWeeklyAdminSummary, runWeeklyReports, weeklyDue, listStudentReports } from "@/server/services/student-reports";
import { makeEmployee, makeMarket, makeStudent, resetDb } from "../setup/db";

const sendEmail = vi.fn(async () => ({ id: "dev" }));
vi.mock("@/server/services/email", () => ({ sendEmail: (...a: unknown[]) => (sendEmail as (...x: unknown[]) => Promise<{ id: string }>)(...a) }));

/** A UTC instant at which it is `hh:mm` local on `localDate` in `tz`. */
function at(localDate: string, hhmm: string, tz: string) {
  const guess = new Date(`${localDate}T${hhmm}:00Z`);
  const offsetMin = (Date.parse(new Date(guess).toLocaleString("en-US", { timeZone: tz }) + " UTC") - guess.getTime()) / 60000;
  return new Date(guess.getTime() - offsetMin * 60000);
}

async function studentWithApps(tz: string, name = "Priya Sharma") {
  const m = await makeMarket();
  const emp = await makeEmployee(m.id);
  const s = await makeStudent(m.id, name);
  await db.user.update({ where: { id: s.user.id }, data: { timezone: tz, status: "ACTIVE" } });
  await db.studentProfile.update({ where: { id: s.student.id }, data: { onboardingCompletedAt: new Date() } });
  return { m, emp, s };
}

async function app(studentId: string, employeeId: string, appliedAt: Date, extra: Partial<{ companyName: string; status: "APPLIED" | "INTERVIEW_SCHEDULED" | "REJECTED" }> = {}) {
  const jobUrl = `https://acme.test/${Math.random().toString(36).slice(2)}`;
  return db.jobApplication.create({
    data: { studentId, employeeId, companyName: extra.companyName ?? "Acme", jobTitle: "Engineer", jobUrl, jobUrlNormalized: jobUrl, status: extra.status ?? "APPLIED", appliedAt, source: "LINKEDIN" },
  });
}

describe("daily digest (F13, D-112)", () => {
  beforeEach(async () => {
    await resetDb();
    sendEmail.mockClear();
  });

  it("digestDue: 19:xx local on a working day, once per day", () => {
    const tz = "America/New_York";
    const tue = "2026-10-13";
    expect(digestDue(at(tue, "19:30", tz), tz, { workingDays: [1, 2, 3, 4, 5], lastDigestKey: null })).toBe(true);
    expect(digestDue(at(tue, "18:59", tz), tz, { workingDays: [1, 2, 3, 4, 5], lastDigestKey: null })).toBe(false);
    expect(digestDue(at(tue, "20:00", tz), tz, { workingDays: [1, 2, 3, 4, 5], lastDigestKey: null })).toBe(false);
    expect(digestDue(at(tue, "19:30", tz), tz, { workingDays: [1, 2, 3, 4, 5], lastDigestKey: tue })).toBe(false);
    expect(digestDue(at("2026-10-11", "19:30", tz), tz, { workingDays: [1, 2, 3, 4, 5], lastDigestKey: null })).toBe(false); // Sunday
    expect(digestDue(at(tue, "19:30", tz), tz, { workingDays: [1, 2, 3, 4, 5], holidays: new Set([tue]), lastDigestKey: null })).toBe(false);
    // Same UTC instant is a different local hour elsewhere.
    expect(digestDue(at(tue, "19:30", tz), "Asia/Kolkata", { workingDays: [1, 2, 3, 4, 5], lastDigestKey: null })).toBe(false);
  });

  it("sends once at 19:00 in the student's zone when applications were logged today, never twice", async () => {
    const tz = "America/Los_Angeles";
    const { emp, s } = await studentWithApps(tz);
    const other = await makeStudent((await makeMarket("CA")).id, "No Apps");
    await db.user.update({ where: { id: other.user.id }, data: { timezone: tz } });
    await db.studentProfile.update({ where: { id: other.student.id }, data: { onboardingCompletedAt: new Date() } });
    const day = "2026-10-14"; // Wednesday
    await app(s.student.id, emp.employee.id, at(day, "10:15", tz), { companyName: "Acme" });
    await app(s.student.id, emp.employee.id, at(day, "14:40", tz), { companyName: "Globex" });
    await app(s.student.id, emp.employee.id, at("2026-10-13", "14:40", tz), { companyName: "Yesterday Inc" });

    expect(await runDailyDigest(at(day, "18:10", tz))).toBe(0);
    expect(await runDailyDigest(at(day, "19:05", tz))).toBe(1);
    expect(await runDailyDigest(at(day, "19:50", tz))).toBe(0); // same day: idempotent
    const n = await db.notification.findMany({ where: { userId: s.user.id, type: "daily_digest" } });
    expect(n).toHaveLength(1);
    expect(n[0]!.title).toContain("2 applications");
    expect(n[0]!.body).toContain("Acme");
    expect(n[0]!.body).not.toContain("Yesterday");
    expect(await db.notification.count({ where: { userId: other.user.id } })).toBe(0);
    expect((await db.studentProfile.findUniqueOrThrow({ where: { id: s.student.id } })).lastDigestKey).toBe(day);
    // Next working day sends again.
    await app(s.student.id, emp.employee.id, at("2026-10-15", "09:00", tz));
    expect(await runDailyDigest(at("2026-10-15", "19:20", tz))).toBe(1);
  });

  it("respects the student's email preference (bell entry still written, no email)", async () => {
    const tz = "Europe/London";
    const { emp, s } = await studentWithApps(tz);
    await db.user.update({ where: { id: s.user.id }, data: { notificationPrefs: { email: { daily_digest: false } } } });
    await app(s.student.id, emp.employee.id, at("2026-10-13", "11:00", tz));
    expect(await runDailyDigest(at("2026-10-13", "19:00", tz))).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(await db.notification.count({ where: { userId: s.user.id, type: "daily_digest" } })).toBe(1);
  });
});

describe("weekly report (F13, D-112)", () => {
  beforeEach(async () => {
    await resetDb();
    sendEmail.mockClear();
  });

  it("weeklyDue: Monday 09:xx local only", () => {
    const tz = "Asia/Kolkata";
    expect(weeklyDue(at("2026-10-12", "09:30", tz), tz, null)).toBe(true);
    expect(weeklyDue(at("2026-10-12", "10:00", tz), tz, null)).toBe(false);
    expect(weeklyDue(at("2026-10-13", "09:30", tz), tz, null)).toBe(false);
    expect(weeklyDue(at("2026-10-12", "09:30", tz), tz, "2026-10-12")).toBe(false);
  });

  it("builds last week's branded PDF once, stores it (purpose report) and attaches it to the email", async () => {
    const tz = "America/New_York";
    const { emp, s } = await studentWithApps(tz, "Priya Sharma");
    const monday = "2026-10-12";
    const a1 = await app(s.student.id, emp.employee.id, at("2026-10-06", "10:00", tz), { companyName: "Acme", status: "INTERVIEW_SCHEDULED" });
    await app(s.student.id, emp.employee.id, at("2026-10-09", "16:00", tz), { companyName: "Globex", status: "REJECTED" });
    await app(s.student.id, emp.employee.id, at("2026-10-12", "08:00", tz), { companyName: "ThisWeek" }); // not in last week
    await db.interview.create({ data: { applicationId: a1.id, scheduledAt: at("2026-10-08", "15:00", tz), timezone: tz, round: "Screen", mode: "Phone" } });
    await db.interview.create({ data: { applicationId: a1.id, scheduledAt: at("2026-10-14", "15:00", tz), timezone: tz, round: "Technical", mode: "Video" } });

    expect((await runWeeklyReports(at(monday, "08:30", tz))).students).toBe(0);
    const r = await runWeeklyReports(at(monday, "09:10", tz));
    expect(r.students).toBe(1);
    expect((await runWeeklyReports(at(monday, "09:40", tz))).students).toBe(0); // idempotent

    const files = await listStudentReports(s.student.id);
    expect(files).toHaveLength(1);
    expect(files[0]!.filename).toContain("2026-10-05");
    const n = await db.notification.findFirstOrThrow({ where: { userId: s.user.id, type: "weekly_report" } });
    expect(n.title).toContain("2 applications");
    expect(n.body).toContain("1 interviews");
    const { buildWeeklyReport } = await import("@/server/services/student-reports");
    const built = await buildWeeklyReport(s.student.id, at(monday, "09:10", tz));
    expect(built.data.applications.map((a) => a.companyName)).toEqual(["Acme", "Globex"]);
    expect(built.data.nextInterviews).toHaveLength(1);
    expect(built.data.interviewsLastWeek).toBe(1);
    expect(built.data.responseRate).toBe(67);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const call = sendEmail.mock.calls[0] as unknown as [{ attachments: { filename: string; content: Buffer }[] }];
    expect(call[0].attachments[0]!.filename).toMatch(/\.pdf$/);
    expect(call[0].attachments[0]!.content.subarray(0, 4).toString()).toBe("%PDF");
    expect(call[0].attachments[0]!.content.length).toBeGreaterThan(2000);
    expect((await db.studentProfile.findUniqueOrThrow({ where: { id: s.student.id } })).lastWeeklyReportKey).toBe(monday);
  });

  it("sends one weekly summary per manager at Monday 09:xx in their zone", async () => {
    const m = await makeMarket();
    const emp = await makeEmployee(m.id);
    const s = await makeStudent(m.id);
    await app(s.student.id, emp.employee.id, new Date("2026-10-07T12:00:00Z"));
    const mgr = await db.user.create({ data: { email: `mgr${Date.now()}@t.test`, name: "Meena", role: "MANAGER", timezone: "Asia/Kolkata" } });
    const mgr2 = await db.user.create({ data: { email: `mgr2${Date.now()}@t.test`, name: "Mo", role: "ADMIN", timezone: "America/New_York" } });
    expect(await runWeeklyAdminSummary(at("2026-10-12", "09:15", "Asia/Kolkata"))).toBe(1);
    expect(await runWeeklyAdminSummary(at("2026-10-12", "09:45", "Asia/Kolkata"))).toBe(0);
    expect(await runWeeklyAdminSummary(at("2026-10-12", "09:15", "America/New_York"))).toBe(1);
    const n = await db.notification.findMany({ where: { type: "weekly_summary_admin" } });
    expect(n.map((x) => x.userId).sort()).toEqual([mgr.id, mgr2.id].sort());
    expect(n[0]!.body).toContain("1 applications");
  });
});
