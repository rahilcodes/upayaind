import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/auth/access";
import { assertCoachCanAccessStudent, assignCoach, cancelSession, coachContext, getCoacheeDetail, getCoachSession, getCoachToday, listCoachees, listCoachOptions, listCoachSessions, listMyCoachees, publishSlots, recordSessionOutcome, scheduleSession } from "@/server/services/coach";
import { bookMockInterview, getPrepPage } from "@/server/services/prep";
import { createSlots, listSlots } from "@/server/services/admin-prep";
import { loadBoard } from "@/server/services/assignment";
import { makeCoach, makeEmployee, makeMarket, makeStudent, resetDb } from "../setup/db";

vi.mock("@/server/services/email", () => ({ sendEmail: vi.fn(async () => undefined) }));

const admin = { id: "admin-actor", role: "ADMIN" as const };
const inDays = (n: number) => new Date(Date.now() + n * 86400e3);

async function setup() {
  const market = await makeMarket();
  const coach = await makeCoach(market.id, { name: "Kavya Iyer" });
  const other = await makeCoach(market.id, { name: "Other Coach" });
  const emp = await makeEmployee(market.id, { name: "Arjun Rao" });
  const stu = await makeStudent(market.id, "Priya Sharma");
  await db.user.update({ where: { id: stu.user.id }, data: { timezone: "America/New_York" } });
  await db.studentProfile.update({ where: { id: stu.student.id }, data: { coachId: coach.employee.id, targetTitles: ["Data Analyst"] } });
  const stranger = await makeStudent(market.id, "Someone Else");
  const ctx = await coachContext(coach.actor);
  const otherCtx = await coachContext(other.actor);
  return { market, coach, other, emp, stu, stranger, ctx, otherCtx, studentActor: { id: stu.user.id, role: "STUDENT" as const } };
}

describe("coach context + access (D-140)", () => {
  beforeEach(resetDb);

  it("resolves the coach's EmployeeProfile and refuses other roles", async () => {
    const c = await setup();
    expect(c.ctx.employeeId).toBe(c.coach.employee.id);
    await expect(coachContext({ id: c.emp.user.id, role: "EMPLOYEE" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(coachContext({ id: c.stu.user.id, role: "STUDENT" })).rejects.toBeInstanceOf(ForbiddenError);
    // An ADMIN without an EmployeeProfile may still open the portal (oversight), with no sessions of their own.
    const a = await coachContext(admin);
    expect(a.employeeId).toBeNull();
    expect((await getCoachToday(a)).upcoming).toEqual([]);
  });

  it("assertCoachCanAccessStudent: coachId match, a non-cancelled session, or ADMIN", async () => {
    const c = await setup();
    const me = { role: "COACH" as const, employeeId: c.coach.employee.id };
    await expect(assertCoachCanAccessStudent(me, c.stu.student.id)).resolves.toBeUndefined();
    await expect(assertCoachCanAccessStudent(me, c.stranger.student.id)).rejects.toBeInstanceOf(ForbiddenError);
    // a cancelled session doesn't grant access…
    const m = await db.mockInterview.create({ data: { coachId: c.coach.employee.id, conductedById: c.coach.employee.id, studentId: c.stranger.student.id, scheduledAt: inDays(1), status: "CANCELLED" } });
    await expect(assertCoachCanAccessStudent(me, c.stranger.student.id)).rejects.toBeInstanceOf(ForbiddenError);
    // …but a scheduled one does
    await db.mockInterview.update({ where: { id: m.id }, data: { status: "SCHEDULED" } });
    await expect(assertCoachCanAccessStudent(me, c.stranger.student.id)).resolves.toBeUndefined();
    await expect(assertCoachCanAccessStudent({ role: "ADMIN", employeeId: null }, c.stranger.student.id)).resolves.toBeUndefined();
    await expect(assertCoachCanAccessStudent({ role: "EMPLOYEE", employeeId: c.emp.employee.id }, c.stu.student.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getCoacheeDetail(c.otherCtx, c.stu.student.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("publish slots + student booking", () => {
  beforeEach(resetDb);

  it("publishes consecutive OPEN slots carrying the coach's EmployeeProfile id as coachId and conductedById", async () => {
    const c = await setup();
    const r = await publishSlots(c.ctx, { scheduledAt: inDays(2).toISOString(), durationMin: 30, focus: "SQL live coding", count: 3, meetingLink: "" });
    expect(r.count).toBe(3);
    const rows = await db.mockInterview.findMany({ orderBy: { scheduledAt: "asc" } });
    expect(rows).toHaveLength(3);
    expect(rows.every((x) => x.status === "OPEN" && x.coachId === c.coach.employee.id && x.conductedById === c.coach.employee.id)).toBe(true);
    expect(rows[1]!.scheduledAt.getTime() - rows[0]!.scheduledAt.getTime()).toBe(30 * 60000);
    expect((await getCoachToday(c.ctx)).openSlots).toHaveLength(3);
    await expect(publishSlots(c.ctx, { scheduledAt: new Date(Date.now() - 86400e3).toISOString(), durationMin: 30, focus: "Past", count: 1 })).rejects.toThrow(/future/);
    await expect(publishSlots(await coachContext(admin), { scheduledAt: inDays(1).toISOString(), durationMin: 30, focus: "Mock", count: 1 })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a student booking an open slot sets coachId, sees the coach's first name and the coach is notified", async () => {
    const c = await setup();
    await publishSlots(c.ctx, { scheduledAt: inDays(3).toISOString(), durationMin: 45, focus: "Behavioural", count: 1 });
    const slot = (await db.mockInterview.findFirstOrThrow()).id;
    // Legacy rows (conductedById only, no coachId) are backfilled on booking.
    await db.mockInterview.update({ where: { id: slot }, data: { coachId: null } });
    const page = await getPrepPage(c.studentActor);
    expect(page.coach).toEqual({ id: c.coach.employee.id, firstName: "Kavya" });
    expect(page.openSlots[0]!.with).toBe("Kavya");
    const booked = await bookMockInterview(c.studentActor, slot);
    expect(booked.coachId).toBe(c.coach.employee.id);
    const row = await db.mockInterview.findUniqueOrThrow({ where: { id: slot } });
    expect(row.status).toBe("SCHEDULED");
    expect(row.coachId).toBe(c.coach.employee.id);
    expect(row.studentId).toBe(c.stu.student.id);
    const after = await getPrepPage(c.studentActor);
    expect(after.upcomingMocks[0]!.with).toBe("Kavya");
    const n = await db.notification.findFirst({ where: { userId: c.coach.user.id, type: "generic" } });
    expect(n?.link).toBe("/coach/sessions");
    // The stranger who booked now appears among the coach's applicants (booked, not assigned).
    const stranger = await makeStudent(c.market.id, "Walk In");
    await publishSlots(c.ctx, { scheduledAt: inDays(4).toISOString(), durationMin: 45, focus: "Case", count: 1 });
    const slot2 = (await db.mockInterview.findFirstOrThrow({ where: { status: "OPEN" } })).id;
    await bookMockInterview({ id: stranger.user.id, role: "STUDENT" }, slot2);
    const list = await listCoachees(c.ctx);
    expect(list.map((s) => [s.name, s.assigned])).toEqual([
      ["Priya Sharma", true],
      ["Walk In", false],
    ]);
    expect(list[0]!.next?.id).toBe(slot);
    expect(list[0]!.targetTitles).toEqual(["Data Analyst"]);
  });
});

describe("schedule / cancel / record outcome", () => {
  beforeEach(resetDb);

  it("schedules a session for a coachee (SCHEDULED + notification) and refuses a non-coachee", async () => {
    const c = await setup();
    const when = inDays(2);
    const m = await scheduleSession(c.ctx, { studentId: c.stu.student.id, scheduledAt: when.toISOString(), durationMin: 45, focus: "Mock: system design", meetingLink: "https://meet.example.com/x", notes: "Warm up first" });
    const row = await db.mockInterview.findUniqueOrThrow({ where: { id: m.id } });
    expect(row.status).toBe("SCHEDULED");
    expect(row.coachId).toBe(c.coach.employee.id);
    expect(row.conductedById).toBe(c.coach.employee.id);
    expect(row.notes).toBe("Warm up first");
    const n = await db.notification.findFirstOrThrow({ where: { userId: c.stu.user.id, type: "mock_session_scheduled" } });
    expect(n.title).toBe("Mock interview scheduled");
    expect(n.body).toContain("Kavya");
    expect(n.body).toContain("(your time)");
    expect(n.link).toBe("/app/prep");
    expect(await db.auditLog.count({ where: { action: "coach.session_scheduled", entityId: m.id } })).toBe(1);
    // Not my coachee → refused (UserError on the studentId field), even if they booked a slot before.
    await expect(scheduleSession(c.ctx, { studentId: c.stranger.student.id, scheduledAt: inDays(3).toISOString(), durationMin: 45, focus: "Mock" })).rejects.toThrow(/assigned to you/);
    // Another coach can't schedule my coachee.
    await expect(scheduleSession(c.otherCtx, { studentId: c.stu.student.id, scheduledAt: inDays(3).toISOString(), durationMin: 45, focus: "Mock" })).rejects.toThrow(/assigned to you/);
    // Overlapping with my own session → refused.
    await expect(scheduleSession(c.ctx, { studentId: c.stu.student.id, scheduledAt: new Date(when.getTime() + 10 * 60000).toISOString(), durationMin: 45, focus: "clash" })).rejects.toThrow(/around that time/);
    // The student sees it with the coach's first name; the coach's Today lists it; .ics lookup works.
    const page = await getPrepPage(c.studentActor);
    expect(page.upcomingMocks.map((x) => x.with)).toEqual(["Kavya"]);
    const today = await getCoachToday(c.ctx);
    expect(today.upcoming.map((x) => x.id)).toEqual([m.id]);
    expect((await getCoachSession(c.ctx, m.id))?.student?.name).toBe("Priya Sharma");
    expect(await getCoachSession(c.otherCtx, m.id)).toBeNull();
    const my = await listMyCoachees(c.ctx);
    expect(my.map((x) => x.name)).toEqual(["Priya Sharma"]);
  });

  it("cancels a booked session (student told) and an open slot (no notification)", async () => {
    const c = await setup();
    const m = await scheduleSession(c.ctx, { studentId: c.stu.student.id, scheduledAt: inDays(2).toISOString(), durationMin: 45, focus: "Mock" });
    await expect(cancelSession(c.otherCtx, { id: m.id })).rejects.toThrow(/not found/);
    await cancelSession(c.ctx, { id: m.id, reason: "I'm unwell." });
    expect((await db.mockInterview.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("CANCELLED");
    const n = await db.notification.findFirstOrThrow({ where: { userId: c.stu.user.id, type: "mock_session_cancelled" } });
    expect(n.title).toBe("Mock interview cancelled");
    expect(n.body).toContain("I'm unwell.");
    await expect(cancelSession(c.ctx, { id: m.id })).rejects.toThrow(/already closed/);
    await publishSlots(c.ctx, { scheduledAt: inDays(5).toISOString(), durationMin: 30, focus: "Open", count: 1 });
    const open = await db.mockInterview.findFirstOrThrow({ where: { status: "OPEN" } });
    await cancelSession(c.ctx, { id: open.id });
    expect((await db.mockInterview.findUniqueOrThrow({ where: { id: open.id } })).status).toBe("CANCELLED");
    expect(await db.notification.count({ where: { type: "mock_session_cancelled" } })).toBe(1);
    const past = await listCoachSessions(c.ctx, { view: "past" });
    expect(past.items.map((x) => x.status).sort()).toEqual(["CANCELLED", "CANCELLED"]);
  });

  it("records a scorecard (+ private notes) or a no-show; the student sees scores but never the notes", async () => {
    const c = await setup();
    const m = await scheduleSession(c.ctx, { studentId: c.stu.student.id, scheduledAt: inDays(1).toISOString(), durationMin: 45, focus: "Mock" });
    await expect(recordSessionOutcome(c.ctx, { id: m.id, outcome: "DONE", scores: null })).rejects.toThrow(/scorecard/);
    await expect(recordSessionOutcome(c.otherCtx, { id: m.id, outcome: "NO_SHOW" })).rejects.toThrow(/not found/);
    await recordSessionOutcome(c.ctx, { id: m.id, outcome: "DONE", scores: { communication: 4, technical: 3, structure: 5, confidence: 2 }, feedback: "Good structure.", notes: "Private: push on SQL." });
    const row = await db.mockInterview.findUniqueOrThrow({ where: { id: m.id } });
    expect(row.status).toBe("DONE");
    expect(row.notes).toBe("Private: push on SQL.");
    const page = await getPrepPage(c.studentActor);
    expect(page.pastMocks[0]!.scores).toEqual({ communication: 4, technical: 3, structure: 5, confidence: 2 });
    expect(page.pastMocks[0]!.feedback).toBe("Good structure.");
    expect(JSON.stringify(page)).not.toContain("Private: push on SQL.");
    expect(await db.notification.count({ where: { userId: c.stu.user.id, type: "generic" } })).toBe(1);
    await expect(recordSessionOutcome(c.ctx, { id: m.id, outcome: "NO_SHOW" })).rejects.toThrow(/already has an outcome/);
    const detail = await getCoacheeDetail(c.ctx, c.stu.student.id);
    expect(detail?.sessions[0]!.scores.structure).toBe(5);
    expect(detail?.sessions[0]!.notes).toBe("Private: push on SQL.");
    const list = await listCoachees(c.ctx);
    expect(list[0]!.last?.scores.confidence).toBe(2);
    // No-show on a second session.
    const m2 = await scheduleSession(c.ctx, { studentId: c.stu.student.id, scheduledAt: inDays(2).toISOString(), durationMin: 45, focus: "Mock 2" });
    await recordSessionOutcome(c.ctx, { id: m2.id, outcome: "NO_SHOW" });
    expect((await db.mockInterview.findUniqueOrThrow({ where: { id: m2.id } })).status).toBe("NO_SHOW");
  });
});

describe("admin: assign a coach + pools", () => {
  beforeEach(resetDb);

  it("assigns / unassigns with audit + notifications and lists only active COACH users", async () => {
    const c = await setup();
    const fresh = await makeStudent(c.market.id, "New Student");
    const options = await listCoachOptions();
    expect(options.map((o) => o.name)).toEqual(["Kavya Iyer", "Other Coach"]);
    expect(options[0]!.coachees).toBe(1);
    const r = await assignCoach(admin.id, { studentId: fresh.student.id, coachId: c.coach.employee.id });
    expect(r.changed).toBe(true);
    expect((await db.studentProfile.findUniqueOrThrow({ where: { id: fresh.student.id } })).coachId).toBe(c.coach.employee.id);
    expect((await db.notification.findFirstOrThrow({ where: { userId: fresh.user.id, type: "coach_assigned" } })).title).toBe("Your interview coach is Kavya");
    expect((await db.notification.findFirstOrThrow({ where: { userId: c.coach.user.id, type: "generic" } })).link).toBe(`/coach/applicants/${fresh.student.id}`);
    expect(await db.auditLog.count({ where: { action: "coach.assigned", entityId: fresh.student.id } })).toBe(1);
    expect((await assignCoach(admin.id, { studentId: fresh.student.id, coachId: c.coach.employee.id })).changed).toBe(false);
    // Only COACH users qualify.
    await expect(assignCoach(admin.id, { studentId: fresh.student.id, coachId: c.emp.employee.id })).rejects.toThrow(/active interview coach/);
    await assignCoach(admin.id, { studentId: fresh.student.id, coachId: null });
    expect((await db.studentProfile.findUniqueOrThrow({ where: { id: fresh.student.id } })).coachId).toBeNull();
    expect(await db.auditLog.count({ where: { action: "coach.unassigned" } })).toBe(1);
    expect((await getPrepPage({ id: fresh.user.id, role: "STUDENT" })).coach).toBeNull();
  });

  it("keeps coaches out of the assignment board but in the admin slot picker (labelled)", async () => {
    const c = await setup();
    const board = await loadBoard();
    expect(board.map((b) => b.name)).toEqual(["Arjun Rao"]);
    await createSlots(admin.id, { conductedById: c.coach.employee.id, scheduledAt: inDays(1).toISOString(), durationMin: 45, focus: "Admin-made", count: 1 });
    const { slots, staff } = await listSlots();
    expect(staff.find((s) => s.name === "Kavya Iyer")?.isCoach).toBe(true);
    expect(staff.find((s) => s.name === "Arjun Rao")?.isCoach).toBe(false);
    expect(staff[0]!.isCoach).toBe(true); // coaches first
    expect(slots[0]!.conductedBy).toBe("Kavya Iyer");
    expect(slots[0]!.coachId).toBe(c.coach.employee.id);
    // Admin-created slots for a coach show up on that coach's Today.
    expect((await getCoachToday(c.ctx)).openSlots).toHaveLength(1);
  });
});
