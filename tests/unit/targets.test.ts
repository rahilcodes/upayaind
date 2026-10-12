import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { getStudentCards, inAlertWindow, proRateFraction, ragFor, rollupStudentDay, runBelowTargetAlerts } from "@/server/services/targets";
import { dateOnly } from "@/lib/dates";
import { makeEmployee, makeMarket, makeStudent, resetDb } from "../setup/db";

vi.mock("@/server/services/email", () => ({ sendEmail: vi.fn(async () => undefined) }));

beforeEach(async () => {
  await resetDb();
});

const schedule = { startTime: "09:30", hours: 9 };

describe("pro-rating across time zones", () => {
  it("is the share of the employee's working day elapsed in their own zone", () => {
    const instant = new Date("2026-10-12T09:00:00Z"); // 14:30 IST, 05:00 New York
    expect(proRateFraction(instant, "Asia/Kolkata", schedule)).toBeCloseTo(5 / 9, 5);
    expect(proRateFraction(instant, "America/New_York", schedule)).toBe(0);
    expect(proRateFraction(new Date("2026-10-12T15:00:00Z"), "America/New_York", schedule)).toBeCloseTo(1.5 / 9, 5); // 11:00 EDT
    expect(proRateFraction(new Date("2026-10-12T13:15:00Z"), "Asia/Kolkata", schedule)).toBe(1); // 18:45 IST → after the 9 h day
    expect(proRateFraction(new Date("2026-10-12T20:00:00Z"), "Asia/Kolkata", schedule)).toBe(0); // 01:30 IST next day → new day
  });

  it("RAG thresholds on the pro-rated target", () => {
    expect(ragFor({ done: 10, target: 25, fraction: 0.4, active: true }).rag).toBe("green"); // expected 10
    expect(ragFor({ done: 6, target: 25, fraction: 0.4, active: true }).rag).toBe("amber"); // 60 %
    expect(ragFor({ done: 5, target: 25, fraction: 0.4, active: true }).rag).toBe("red"); // 50 %
    expect(ragFor({ done: 25, target: 25, fraction: 0.4, active: true }).rag).toBe("done");
    expect(ragFor({ done: 0, target: 25, fraction: 0, active: true }).rag).toBe("green"); // before the day starts
    expect(ragFor({ done: 0, target: 25, fraction: 0.5, active: false }).rag).toBe("off");
    expect(ragFor({ done: 0, target: 25, fraction: 0.5, active: true, workingDay: false }).rag).toBe("rest");
  });

  it("alert window is one hour from the configured local time", () => {
    expect(inAlertWindow(new Date("2026-10-12T09:30:00Z"), "Asia/Kolkata", "15:00")).toBe(true); // 15:00 IST
    expect(inAlertWindow(new Date("2026-10-12T10:31:00Z"), "Asia/Kolkata", "15:00")).toBe(false);
    expect(inAlertWindow(new Date("2026-10-12T19:10:00Z"), "America/New_York", "15:00")).toBe(true);
  });
});

async function setup(target = 20) {
  const m = await makeMarket();
  const e = await makeEmployee(m.id, { name: "Arjun Rao" });
  const plan = await db.plan.create({ data: { code: `p${Date.now()}`, name: "Basic" } });
  const price = await db.planPrice.create({ data: { planId: plan.id, marketId: m.id, interval: "MONTHLY", amountMinor: 9900, currency: "USD", dailyTarget: target } });
  const mk = async (name: string, status: "ACTIVE" | "PAST_DUE" = "ACTIVE") => {
    const s = await makeStudent(m.id, name);
    await db.assignment.create({ data: { studentId: s.student.id, employeeId: e.employee.id, source: "AUTO", startsAt: new Date("2026-01-01T00:00:00Z") } });
    await db.subscription.create({ data: { studentId: s.student.id, planPriceId: price.id, status, provider: "MANUAL" } });
    return s;
  };
  return { m, e, mk };
}

async function apps(studentId: string, employeeId: string, n: number, at: Date) {
  for (let i = 0; i < n; i++) {
    await db.jobApplication.create({ data: { studentId, employeeId, companyName: `Co ${i}`, jobTitle: "Analyst", jobUrl: `https://x.test/${studentId}/${i}/${at.getTime()}`, jobUrlNormalized: `x.test/${studentId}/${i}/${at.getTime()}`, source: "LINKEDIN", appliedAt: new Date(at.getTime() + i * 1000) } });
  }
}

describe("student cards + alerts", () => {
  it("computes per-student RAG and greys out inactive subscriptions", async () => {
    const c = await setup(20);
    const a = await c.mk("Ava Green");
    const b = await c.mk("Ben Amber");
    const r = await c.mk("Raj Red");
    const off = await c.mk("Ola Off", "PAST_DUE");
    const now = new Date("2026-10-12T09:00:00Z"); // 14:30 IST Monday → fraction 5/9, expected ≈ 11.1
    await apps(a.student.id, c.e.employee.id, 12, new Date("2026-10-12T04:30:00Z"));
    await apps(b.student.id, c.e.employee.id, 7, new Date("2026-10-12T04:30:00Z"));
    await apps(r.student.id, c.e.employee.id, 3, new Date("2026-10-12T04:30:00Z"));
    await apps(r.student.id, c.e.employee.id, 5, new Date("2026-10-11T04:30:00Z")); // yesterday: not counted
    const { cards } = await getStudentCards(c.e.employee.id, { now });
    const by = Object.fromEntries(cards.map((x) => [x.name, x]));
    expect(by["Ava Green"]).toMatchObject({ rag: "green", done: 12, target: 20 });
    expect(by["Ben Amber"]).toMatchObject({ rag: "amber", done: 7 });
    expect(by["Raj Red"]).toMatchObject({ rag: "red", done: 3 });
    expect(by["Ola Off"]).toMatchObject({ rag: "off", active: false });
    expect(cards[0]!.name).toBe("Raj Red"); // worst first
    expect(off).toBeTruthy();
  });

  it("StudentDay rollup sets the target only on active working days", async () => {
    const c = await setup(25);
    const s = await c.mk("Ava");
    await apps(s.student.id, c.e.employee.id, 4, new Date("2026-10-12T05:00:00Z"));
    expect(await rollupStudentDay(s.student.id, "2026-10-12", "Asia/Kolkata")).toEqual({ applied: 4, target: 25 });
    expect(await rollupStudentDay(s.student.id, "2026-10-11", "Asia/Kolkata")).toEqual({ applied: 0, target: 0 }); // Sunday
    const row = await db.studentDay.findUniqueOrThrow({ where: { studentId_date: { studentId: s.student.id, date: dateOnly("2026-10-12") } } });
    expect(row.applied).toBe(4);
  });

  it("below-target alert at 3 pm employee time: < 50 % of target → employee + managers, once a day", async () => {
    const c = await setup(20);
    const low = await c.mk("Low Student");
    const ok = await c.mk("Ok Student");
    const mgr = await db.user.create({ data: { email: "mgr@t.test", name: "Meena", role: "MANAGER" } });
    await apps(low.student.id, c.e.employee.id, 4, new Date("2026-10-12T04:30:00Z"));
    await apps(ok.student.id, c.e.employee.id, 11, new Date("2026-10-12T04:30:00Z"));
    expect((await runBelowTargetAlerts(new Date("2026-10-12T07:00:00Z"))).employees).toBe(0); // 12:30 IST: outside window
    expect((await runBelowTargetAlerts(new Date("2026-10-12T09:35:00Z"))).employees).toBe(1); // 15:05 IST
    const n = await db.notification.findFirstOrThrow({ where: { userId: c.e.user.id, type: "below_target" } });
    expect(n.body).toContain("Low Student: 4 / 20");
    expect(n.body).not.toContain("Ok Student");
    expect(await db.notification.count({ where: { userId: mgr.id, type: "below_target" } })).toBe(1);
    expect((await runBelowTargetAlerts(new Date("2026-10-12T10:00:00Z"))).employees).toBe(0); // already sent today
  });
});
