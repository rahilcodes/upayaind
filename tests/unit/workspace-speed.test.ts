import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { setAiTransport, type TransportRequest } from "@/server/ai/client";
import { markApplied, quickLog } from "@/server/services/applications";
import { getOrCreateBaseVersion, tailorResume } from "@/server/services/resumes";
import { suggestEdit, textProblems } from "@/server/services/resume-edits";
import { getWorkspaceDefaults, listCompanySuggestions, rememberWorkspaceDefaults } from "@/server/services/workspace-prefs";
import { runInterviewReminders } from "@/server/services/interview-reminders";
import { googleCalendarUrl, interviewCalendarEvent } from "@/lib/ics";
import { makeEmployee, makeMarket, makeStudent, resetDb } from "../setup/db";
import { ANALYSIS, JD_TEXT, MASTER, clone } from "./resume-fixtures";

vi.mock("@/server/services/email", () => ({ sendEmail: vi.fn(async () => ({ id: "email_test" })) }));

async function setup() {
  const market = await makeMarket();
  const emp = await makeEmployee(market.id, { name: "Arjun Rao" });
  const stu = await makeStudent(market.id, "Priya Sharma");
  await db.studentProfile.update({ where: { id: stu.student.id }, data: { masterProfile: MASTER as unknown as Prisma.InputJsonValue } });
  await db.assignment.create({ data: { studentId: stu.student.id, employeeId: emp.employee.id, source: "AUTO" } });
  const plan = await db.plan.create({ data: { code: `p${Date.now()}`, name: "Standard" } });
  const price = await db.planPrice.create({ data: { planId: plan.id, marketId: market.id, interval: "MONTHLY", amountMinor: 9900, currency: "USD", dailyTarget: 25 } });
  await db.subscription.create({ data: { studentId: stu.student.id, planPriceId: price.id, status: "ACTIVE", provider: "MANUAL" } });
  const actor = { id: emp.user.id, role: "EMPLOYEE" as const, timezone: "Asia/Kolkata" };
  return { market, emp, stu, studentId: stu.student.id, actor };
}

/** Mock Anthropic transport: returns the queued tool inputs in order (last one repeats). */
function mockAi(...outputs: unknown[]) {
  const calls: TransportRequest[] = [];
  setAiTransport(async (req) => {
    calls.push(req);
    const input = outputs.length > 1 ? outputs.shift() : outputs[0];
    return { model: req.model, content: [{ type: "tool_use", name: req.tool_choice.name, input }], usage: { input_tokens: 100, output_tokens: 50 } };
  });
  return calls;
}

/** A tailored, unlocked version to edit (AI mocked to return the master + analysis). */
async function tailored(c: Awaited<ReturnType<typeof setup>>) {
  mockAi(ANALYSIS, clone(MASTER));
  const r = await tailorResume(c.actor, { studentId: c.studentId, jd: JD_TEXT, company: "Northstar Bank", title: "Data Analyst" });
  setAiTransport(null);
  return r;
}

beforeEach(async () => {
  await resetDb();
});
afterEach(() => setAiTransport(null));

describe("AI editor assists (D-101)", () => {
  it("accepts an improved bullet that keeps the facts, logs AiUsage", async () => {
    const c = await setup();
    const v = await tailored(c);
    const calls = mockAi({ text: "Designed and shipped Tableau dashboards that cut weekly reporting time by 35%", skillsMentioned: ["Tableau"], keywordsUsed: ["Tableau"] });
    const r = await suggestEdit(c.actor, { versionId: v.versionId, mode: "improve", target: { kind: "bullet", experienceId: "exp_1", bulletId: "exp_1_b1" }, content: v.content, jobTitle: "Data Analyst", jd: JD_TEXT });
    expect(r.before).toBe("Built Tableau dashboards that cut weekly reporting time by 35%.");
    expect(r.after).toBe("Designed and shipped Tableau dashboards that cut weekly reporting time by 35%");
    expect(r.unchanged).toBe(false);
    expect(r.keywordsUsed).toEqual(["Tableau"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.system).toMatch(/TRUTHFULNESS RULES/);
    expect(calls[0]!.messages[0]!.content).toContain("ORIGINAL BULLET");
    const usage = await db.aiUsage.findMany({ where: { task: "improve_bullet" } });
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ userId: c.actor.id, studentId: c.studentId, inputTokens: 100, outputTokens: 50 });
  });

  it("rejects a bullet that invents a skill from the JD (retries once, then discards)", async () => {
    const c = await setup();
    const v = await tailored(c);
    // "Airflow" is a nice-to-have JD skill the student doesn't have.
    const calls = mockAi({ text: "Built Airflow and Tableau pipelines that cut reporting time by 35%", skillsMentioned: ["Tableau"], keywordsUsed: ["Airflow"] });
    await expect(suggestEdit(c.actor, { versionId: v.versionId, mode: "match", target: { kind: "bullet", experienceId: "exp_1", bulletId: "exp_1_b1" }, content: v.content, jd: JD_TEXT })).rejects.toThrow(/discarded.*"Airflow" comes from the job description/);
    expect(calls).toHaveLength(2); // one retry with the problem list
    expect(calls[1]!.messages[0]!.content).toMatch(/PREVIOUS ATTEMPT WAS REJECTED[\s\S]*Airflow/);
  });

  it("rejects a self-reported unknown skill and an invented number", async () => {
    const c = await setup();
    const v = await tailored(c);
    mockAi({ text: "Built Tableau dashboards with Kubernetes, cutting reporting time by 60%", skillsMentioned: ["Tableau", "Kubernetes"], keywordsUsed: [] });
    await expect(suggestEdit(c.actor, { versionId: v.versionId, mode: "improve", target: { kind: "bullet", experienceId: "exp_1", bulletId: "exp_1_b1" }, content: v.content })).rejects.toThrow(/Kubernetes|60/);
  });

  it("rewrites the summary for the job and rejects one that adds a JD skill", async () => {
    const c = await setup();
    const v = await tailored(c);
    mockAi({ summary: "Data analyst with 4 years of experience building Tableau dashboards and SQL pipelines in Snowflake for retail and analytics teams.", skillsMentioned: ["Tableau", "SQL", "Snowflake"] });
    const ok = await suggestEdit(c.actor, { versionId: v.versionId, mode: "summary", target: { kind: "summary" }, content: v.content, jobTitle: "Data Analyst", company: "Northstar Bank", jd: JD_TEXT });
    expect(ok.after).toMatch(/^Data analyst with 4 years/);
    expect(ok.before).toBe(MASTER.summary);
    setAiTransport(null);
    mockAi({ summary: "Data analyst with 4 years of experience in Airflow and dbt pipelines.", skillsMentioned: ["dbt", "Airflow"] });
    await expect(suggestEdit(c.actor, { versionId: v.versionId, mode: "summary", target: { kind: "summary" }, content: v.content, jd: JD_TEXT })).rejects.toThrow(/Airflow/);
    expect(await db.aiUsage.count({ where: { task: "rewrite_summary" } })).toBeGreaterThanOrEqual(2);
  });

  it("without an API key the existing 'AI isn't configured' error is thrown (no fake)", async () => {
    const c = await setup();
    const v = await tailored(c);
    await expect(suggestEdit(c.actor, { versionId: v.versionId, mode: "improve", target: { kind: "bullet", experienceId: "exp_1", bulletId: "exp_1_b1" }, content: v.content })).rejects.toThrow(/AI isn't configured/);
  });

  it("refuses locked versions and unassigned employees", async () => {
    const c = await setup();
    const v = await tailored(c);
    mockAi({ text: "x", skillsMentioned: [], keywordsUsed: [] });
    const other = await makeEmployee(c.market.id);
    await expect(suggestEdit({ id: other.user.id, role: "EMPLOYEE" }, { versionId: v.versionId, mode: "improve", target: { kind: "bullet", experienceId: "exp_1", bulletId: "exp_1_b1" }, content: v.content })).rejects.toThrow();
    await markApplied(c.actor, { studentId: c.studentId, jobUrl: "https://jobs.example.com/1", companyName: "Northstar Bank", jobTitle: "Data Analyst", resumeVersionId: v.versionId, source: "LINKEDIN" });
    await expect(suggestEdit(c.actor, { versionId: v.versionId, mode: "improve", target: { kind: "bullet", experienceId: "exp_1", bulletId: "exp_1_b1" }, content: v.content })).rejects.toThrow(/can't be changed/);
  });

  it("textProblems: numbers from the original or the profile are fine; new ones and placeholders are not", () => {
    expect(textProblems({ text: "Cut reporting time by 35% across 120 stores", original: "Built dashboards that cut reporting time by 35%.", master: MASTER, skillsMentioned: [], analysis: null })).toEqual([]);
    const p = textProblems({ text: "Cut reporting time by 40% for [Company]", original: "Built dashboards.", master: MASTER, skillsMentioned: ["sql"], analysis: ANALYSIS });
    expect(p.some((x) => x.includes('"40"'))).toBe(true);
    expect(p.some((x) => x.includes("placeholders"))).toBe(true);
    expect(p.some((x) => x.includes("sql"))).toBe(false); // case-insensitive profile match
  });
});

describe("workspace defaults + company suggestions (D-102)", () => {
  it("remembers the last source / mode / type / location per employee", async () => {
    const c = await setup();
    expect(await getWorkspaceDefaults(c.actor.id)).toEqual({});
    await rememberWorkspaceDefaults(c.actor.id, { source: "INDEED", workMode: "REMOTE", employmentType: "CONTRACT", location: "Austin, TX" });
    expect(await getWorkspaceDefaults(c.actor.id)).toEqual({ source: "INDEED", workMode: "REMOTE", employmentType: "CONTRACT", location: "Austin, TX" });
    await rememberWorkspaceDefaults(c.actor.id, { source: "DICE", location: null });
    expect(await getWorkspaceDefaults(c.actor.id)).toMatchObject({ source: "DICE", workMode: "REMOTE", location: null });
    await rememberWorkspaceDefaults(c.actor.id, { source: "NOT_A_SOURCE" }); // ignored
    expect((await getWorkspaceDefaults(c.actor.id)).source).toBe("DICE");
  });

  it("ranks companies by frequency with their domain; managers see everyone's; companyDomain can be supplied", async () => {
    const c = await setup();
    const base = await getOrCreateBaseVersion(c.actor, c.studentId);
    await quickLog(c.actor, { studentId: c.studentId, jobUrl: "https://careers.acme.com/jobs/1", companyName: "Acme", jobTitle: "Analyst", source: "COMPANY_SITE", resumeVersionId: base.id });
    await quickLog(c.actor, { studentId: c.studentId, jobUrl: "https://www.linkedin.com/jobs/view/2", companyName: "Acme Inc.", companyDomain: "acme.com", jobTitle: "Analyst II", source: "LINKEDIN", resumeVersionId: base.id });
    await quickLog(c.actor, { studentId: c.studentId, jobUrl: "https://www.linkedin.com/jobs/view/3", companyName: "Globex", companyDomain: "globex.example", jobTitle: "Analyst", source: "LINKEDIN", resumeVersionId: base.id });
    const mine = await listCompanySuggestions(c.actor);
    expect(mine.map((s) => [s.name, s.domain, s.count])).toEqual([
      ["Acme", "acme.com", 2],
      ["Globex", "globex.example", 1],
    ]);
    // Another employee with their own student sees only theirs; a manager sees all.
    const other = await makeEmployee(c.market.id);
    expect(await listCompanySuggestions({ id: other.user.id, role: "EMPLOYEE" })).toEqual([]);
    const all = await listCompanySuggestions({ id: "mgr", role: "MANAGER" });
    expect(all).toHaveLength(2);
    const app = await db.jobApplication.findFirst({ where: { companyName: "Globex" }, select: { companyDomain: true } });
    expect(app?.companyDomain).toBe("globex.example");
  });
});

describe("interview reminders (D-103)", () => {
  async function withInterview(c: Awaited<ReturnType<typeof setup>>, scheduledAt: Date) {
    const base = await getOrCreateBaseVersion(c.actor, c.studentId);
    const { applicationId } = await quickLog(c.actor, { studentId: c.studentId, jobUrl: `https://jobs.example.com/${scheduledAt.getTime()}`, companyName: "Acme", jobTitle: "Analyst", source: "OTHER", resumeVersionId: base.id, confirmSimilar: true });
    const i = await db.interview.create({ data: { applicationId, scheduledAt, timezone: "America/New_York", round: "Technical", mode: "Video", meetingLink: "https://meet.example.com/x" } });
    return { applicationId, interviewId: i.id };
  }

  it("sends the 24 h and the 1 h reminder once each, to the student and the specialist", async () => {
    const c = await setup();
    const t0 = new Date("2026-10-12T10:00:00Z");
    const { interviewId } = await withInterview(c, new Date("2026-10-13T09:30:00Z")); // in 23.5 h
    expect(await runInterviewReminders(t0)).toMatchObject({ sent: 1 });
    expect(await runInterviewReminders(t0)).toMatchObject({ sent: 0 }); // idempotent
    let n = await db.notification.findMany({ where: { type: "interview_reminder" }, orderBy: { createdAt: "asc" } });
    expect(n).toHaveLength(2);
    expect(new Set(n.map((x) => x.userId))).toEqual(new Set([c.stu.user.id, c.emp.user.id]));
    expect(n.map((x) => x.title)).toEqual(["Interview tomorrow: Acme", "Interview tomorrow: Acme"]);
    const stu = n.find((x) => x.userId === c.stu.user.id)!;
    expect(stu.body).toMatch(/Tue 13 Oct, 5:30 AM \(your time\)/); // America/New_York default for the student? (UTC-4)
    expect(stu.link).toBe(`/app/applications/${(await db.interview.findUnique({ where: { id: interviewId }, select: { applicationId: true } }))!.applicationId}`);
    const emp = n.find((x) => x.userId === c.emp.user.id)!;
    expect(emp.body).toMatch(/^Priya Sharma: /);
    expect(emp.body).toMatch(/3:00 PM \(your time\)/); // Asia/Kolkata
    expect(emp.link).toMatch(/^\/work\/interviews\?application=/);

    // Not yet time for the 1 h one.
    expect(await runInterviewReminders(new Date("2026-10-13T07:00:00Z"))).toMatchObject({ sent: 0 });
    // 65 min before → 1 h reminder (once).
    expect(await runInterviewReminders(new Date("2026-10-13T08:25:00Z"))).toMatchObject({ sent: 1 });
    expect(await runInterviewReminders(new Date("2026-10-13T08:55:00Z"))).toMatchObject({ sent: 0 });
    n = await db.notification.findMany({ where: { type: "interview_reminder" } });
    expect(n).toHaveLength(4);
    expect(n.filter((x) => x.title === "Interview in 1 hour: Acme")).toHaveLength(2);
    const row = await db.interview.findUnique({ where: { id: interviewId }, select: { reminder24SentAt: true, reminder1hSentAt: true } });
    expect(row?.reminder24SentAt).toEqual(t0);
    expect(row?.reminder1hSentAt).toEqual(new Date("2026-10-13T08:25:00Z"));
  });

  it("an interview created inside the last 90 minutes only gets the 1 h reminder; past, finished and closed ones are skipped", async () => {
    const c = await setup();
    const now = new Date("2026-10-12T10:00:00Z");
    const soon = await withInterview(c, new Date("2026-10-12T11:00:00Z"));
    expect(await runInterviewReminders(now)).toMatchObject({ sent: 1 });
    const r = await db.interview.findUnique({ where: { id: soon.interviewId }, select: { reminder24SentAt: true, reminder1hSentAt: true } });
    expect(r?.reminder1hSentAt).toEqual(now);
    expect(r?.reminder24SentAt).toBeNull();

    const past = await withInterview(c, new Date("2026-10-12T09:00:00Z"));
    const done = await withInterview(c, new Date("2026-10-12T20:00:00Z"));
    await db.interview.update({ where: { id: done.interviewId }, data: { outcome: "Went well" } });
    const closed = await withInterview(c, new Date("2026-10-12T21:00:00Z"));
    await db.jobApplication.update({ where: { id: closed.applicationId }, data: { status: "REJECTED" } });
    expect(await runInterviewReminders(now)).toMatchObject({ sent: 0 });
    void past;
  });
});

describe("Google Calendar link (D-103)", () => {
  it("builds a TEMPLATE link with UTC dates, details and location", () => {
    const i = { scheduledAt: new Date("2026-10-13T09:30:00Z"), timezone: "America/New_York", round: "Technical", mode: "Video", meetingLink: "https://meet.example.com/x", interviewers: "Sam & Lee", application: { companyName: "Acme, Inc.", jobTitle: "Analyst" } };
    const url = googleCalendarUrl(interviewCalendarEvent(i, { detailsUrl: "https://upayaind.test/app/applications/1" }));
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(u.searchParams.get("action")).toBe("TEMPLATE");
    expect(u.searchParams.get("text")).toBe("Interview: Analyst at Acme, Inc.");
    expect(u.searchParams.get("dates")).toBe("20261013T093000Z/20261013T103000Z");
    expect(u.searchParams.get("location")).toBe("https://meet.example.com/x");
    expect(u.searchParams.get("details")).toContain("Round: Technical\nMode: Video\n");
    expect(u.searchParams.get("details")).toContain("Interviewers: Sam & Lee");
    expect(u.searchParams.get("details")).toContain("Details: https://upayaind.test/app/applications/1");
    const onsite = googleCalendarUrl(interviewCalendarEvent({ ...i, mode: "Onsite" }));
    expect(new URL(onsite).searchParams.get("location")).toBe("Acme, Inc.");
  });
});
