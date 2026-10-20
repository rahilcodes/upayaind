import "server-only";
import { z } from "zod";
import type { Role } from "@/generated/prisma/enums";
import { db, Prisma } from "@/server/db";
import { ForbiddenError } from "@/server/auth/access";
import { UserError } from "@/server/errors";
import { formatInTz } from "@/lib/format";
import { firstName } from "@/lib/utils";
import { audit } from "./audit";
import { notify } from "./notify";
import { parseScores } from "./prep";
import { slotInputSchema } from "./admin-prep";

/**
 * Interview coach (role COACH, D-140): a staff member who only runs mock
 * interviews and training sessions. Coaches publish open slots, schedule
 * sessions for the students assigned to them (`StudentProfile.coachId`),
 * record scorecards and keep private notes. They never see applications,
 * resumes, the vault or messages — this module only touches MockInterview and
 * a narrow slice of the student profile.
 */

export type CoachActor = { id: string; role: Role };
/** The coach's own EmployeeProfile id (ADMINs opening /coach without a profile get null). */
export type CoachContext = { user: CoachActor; employeeId: string | null };

export const COACH_SESSION_STATUSES = ["OPEN", "SCHEDULED", "DONE", "NO_SHOW", "CANCELLED"] as const;
export type CoachSessionStatus = (typeof COACH_SESSION_STATUSES)[number];

const SESSION_SELECT = {
  id: true,
  scheduledAt: true,
  durationMin: true,
  status: true,
  focus: true,
  meetingLink: true,
  scores: true,
  feedback: true,
  notes: true,
  createdAt: true,
  student: { select: { id: true, targetTitles: true, user: { select: { name: true, timezone: true } } } },
} satisfies Prisma.MockInterviewSelect;

type SessionRow = Prisma.MockInterviewGetPayload<{ select: typeof SESSION_SELECT }>;

function shape(m: SessionRow) {
  return {
    id: m.id,
    scheduledAt: m.scheduledAt,
    durationMin: m.durationMin,
    status: m.status as CoachSessionStatus,
    focus: m.focus,
    meetingLink: m.meetingLink,
    scores: parseScores(m.scores),
    feedback: m.feedback,
    notes: m.notes,
    student: m.student ? { id: m.student.id, name: m.student.user.name, timezone: m.student.user.timezone, targetTitles: m.student.targetTitles } : null,
  };
}
export type CoachSession = ReturnType<typeof shape>;

/** Resolve the signed-in coach's EmployeeProfile (null for an ADMIN without one). */
export async function coachContext(user: CoachActor): Promise<CoachContext> {
  if (user.role !== "COACH" && user.role !== "ADMIN") throw new ForbiddenError();
  const emp = await db.employeeProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!emp && user.role === "COACH") throw new ForbiddenError("Your coach profile isn't set up yet. Ask an admin.");
  return { user, employeeId: emp?.id ?? null };
}

function mine(ctx: CoachContext): string {
  if (!ctx.employeeId) throw new ForbiddenError("No coach profile.");
  return ctx.employeeId;
}

/**
 * Resource rule for coaches: a coach may open a student only when the student
 * is assigned to them (`coachId`) or has a non-cancelled session with them.
 * ADMIN is always allowed.
 */
export async function assertCoachCanAccessStudent(actor: { role: Role; employeeId: string | null }, studentId: string): Promise<void> {
  if (actor.role === "ADMIN") return;
  if (actor.role !== "COACH" || !actor.employeeId) throw new ForbiddenError();
  const s = await db.studentProfile.findUnique({ where: { id: studentId }, select: { coachId: true } });
  if (!s) throw new ForbiddenError();
  if (s.coachId === actor.employeeId) return;
  const n = await db.mockInterview.count({ where: { studentId, coachId: actor.employeeId, status: { not: "CANCELLED" } } });
  if (n === 0) throw new ForbiddenError("This student isn't assigned to you.");
}

// ─────────────────────────── Today / sessions ───────────────────────────

export async function getCoachToday(ctx: CoachContext, now = new Date(), timezone = "UTC") {
  if (!ctx.employeeId) return { todayCount: 0, upcoming: [] as CoachSession[], openSlots: [] as CoachSession[], toRecord: 0, coachees: 0 };
  const coachId = ctx.employeeId;
  const weekEnd = new Date(now.getTime() + 7 * 86400e3);
  const [upcoming, openSlots, toRecord, coachees] = await Promise.all([
    db.mockInterview.findMany({ where: { coachId, status: "SCHEDULED", scheduledAt: { gte: new Date(now.getTime() - 2 * 3600e3), lt: weekEnd } }, orderBy: { scheduledAt: "asc" }, take: 50, select: SESSION_SELECT }),
    db.mockInterview.findMany({ where: { coachId, status: "OPEN", studentId: null, scheduledAt: { gt: now } }, orderBy: { scheduledAt: "asc" }, take: 20, select: SESSION_SELECT }),
    db.mockInterview.count({ where: { coachId, status: "SCHEDULED", scheduledAt: { lt: new Date(now.getTime() - 2 * 3600e3) } } }),
    db.studentProfile.count({ where: { coachId, user: { deletedAt: null } } }),
  ]);
  const todayKey = formatInTz(now, timezone, "yyyy-MM-dd");
  const todayCount = upcoming.filter((m) => formatInTz(m.scheduledAt, timezone, "yyyy-MM-dd") === todayKey).length;
  return { todayCount, upcoming: upcoming.map(shape), openSlots: openSlots.map(shape), toRecord, coachees };
}

export const sessionsFilterSchema = z.object({
  view: z.enum(["upcoming", "past"]).catch("upcoming"),
  status: z.enum(COACH_SESSION_STATUSES).optional().catch(undefined),
  student: z.string().max(64).optional().catch(undefined),
});

/** My sessions: upcoming (OPEN + SCHEDULED, soonest first) or past (everything else plus overdue SCHEDULED, latest first). */
export async function listCoachSessions(ctx: CoachContext, raw: Record<string, string | undefined>, now = new Date()) {
  const f = sessionsFilterSchema.parse(raw);
  if (!ctx.employeeId) return { filter: f, items: [] as CoachSession[] };
  const cutoff = new Date(now.getTime() - 2 * 3600e3);
  const where: Prisma.MockInterviewWhereInput = { coachId: ctx.employeeId };
  if (f.student) where.studentId = f.student;
  if (f.status) where.status = f.status;
  if (f.view === "upcoming") {
    where.scheduledAt = { gte: cutoff };
    if (!f.status) where.status = { in: ["OPEN", "SCHEDULED"] };
  } else {
    where.OR = [{ scheduledAt: { lt: cutoff } }, { status: { in: ["DONE", "NO_SHOW", "CANCELLED"] } }];
  }
  const rows = await db.mockInterview.findMany({ where, orderBy: { scheduledAt: f.view === "upcoming" ? "asc" : "desc" }, take: 200, select: SESSION_SELECT });
  return { filter: f, items: rows.map(shape) };
}

/** One of my sessions (for the .ics download and detail views). */
export async function getCoachSession(ctx: CoachContext, id: string) {
  const where: Prisma.MockInterviewWhereInput = ctx.user.role === "ADMIN" && !ctx.employeeId ? { id } : { id, coachId: mine(ctx) };
  const m = await db.mockInterview.findFirst({ where, select: SESSION_SELECT });
  return m ? shape(m) : null;
}

// ─────────────────────────── Publish slots ───────────────────────────

export const coachSlotSchema = slotInputSchema.omit({ conductedById: true });
export type CoachSlotInput = z.input<typeof coachSlotSchema>;

/** Publish consecutive OPEN slots that any student can book (same rules as the admin slot form). */
export async function publishSlots(ctx: CoachContext, raw: CoachSlotInput) {
  const coachId = mine(ctx);
  const input = coachSlotSchema.parse(raw);
  const data = Array.from({ length: input.count }, (_, i) => ({
    coachId,
    conductedById: coachId,
    scheduledAt: new Date(input.scheduledAt.getTime() + i * input.durationMin * 60000),
    durationMin: input.durationMin,
    status: "OPEN",
    focus: input.focus,
    meetingLink: input.meetingLink || null,
  }));
  await db.mockInterview.createMany({ data });
  await audit({ actorId: ctx.user.id, action: "coach.slots_published", entity: "MockInterview", after: { coachId, count: data.length, from: data[0]!.scheduledAt } });
  return { count: data.length };
}

// ─────────────────────────── Schedule a session ───────────────────────────

export const scheduleSessionSchema = z.object({
  studentId: z.string().min(1, "Pick an applicant."),
  scheduledAt: z.coerce.date({ error: "Pick a date and time." }).refine((d) => d.getTime() > Date.now(), "Pick a time in the future."),
  durationMin: z.coerce.number().int().min(15).max(180).default(45),
  focus: z.string().trim().min(2, "Describe the focus.").max(160),
  meetingLink: z
    .string()
    .trim()
    .max(1000)
    .refine((v) => !v || /^https:\/\//i.test(v), "Use an https:// link.")
    .optional()
    .nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
});
export type ScheduleSessionInput = z.input<typeof scheduleSessionSchema>;

/**
 * Book a session directly for one of my assigned applicants (status SCHEDULED).
 * Only coachees (`StudentProfile.coachId` = me) can be scheduled this way —
 * other students book my open slots themselves.
 */
export async function scheduleSession(ctx: CoachContext, raw: ScheduleSessionInput) {
  const coachId = mine(ctx);
  const input = scheduleSessionSchema.parse(raw);
  const s = await db.studentProfile.findUnique({ where: { id: input.studentId }, select: { id: true, coachId: true, userId: true, user: { select: { name: true, timezone: true, deletedAt: true, status: true } } } });
  if (!s || s.user.deletedAt || s.user.status === "DEACTIVATED") throw new UserError("Applicant not found.", "studentId");
  if (s.coachId !== coachId) throw new UserError("You can only schedule sessions for applicants assigned to you.", "studentId");
  const clash = await db.mockInterview.count({ where: { coachId, status: "SCHEDULED", scheduledAt: { gt: new Date(input.scheduledAt.getTime() - input.durationMin * 60000), lt: new Date(input.scheduledAt.getTime() + input.durationMin * 60000) } } });
  if (clash) throw new UserError("You already have a session around that time.", "scheduledAt");
  const coach = await db.employeeProfile.findUniqueOrThrow({ where: { id: coachId }, select: { user: { select: { name: true } } } });
  const m = await db.mockInterview.create({
    data: { coachId, conductedById: coachId, studentId: s.id, scheduledAt: input.scheduledAt, durationMin: input.durationMin, status: "SCHEDULED", focus: input.focus, meetingLink: input.meetingLink || null, notes: input.notes || null },
    select: { id: true, scheduledAt: true },
  });
  await audit({ actorId: ctx.user.id, action: "coach.session_scheduled", entity: "MockInterview", entityId: m.id, after: { studentId: s.id, scheduledAt: m.scheduledAt, focus: input.focus } });
  await notify(s.userId, "mock_session_scheduled", {
    coach: firstName(coach.user.name),
    focus: input.focus,
    when: `${formatInTz(m.scheduledAt, s.user.timezone, "EEE d MMM, h:mm a")} (your time)`,
    meetingLink: input.meetingLink || null,
  }).catch(() => undefined);
  return m;
}

// ─────────────────────────── Cancel ───────────────────────────

export const cancelSessionSchema = z.object({ id: z.string().min(1), reason: z.string().trim().max(500).optional().nullable() });

/** Cancel one of my OPEN or SCHEDULED sessions; a booked student is told. */
export async function cancelSession(ctx: CoachContext, raw: z.input<typeof cancelSessionSchema>) {
  const coachId = mine(ctx);
  const input = cancelSessionSchema.parse(raw);
  const m = await db.mockInterview.findFirst({ where: { id: input.id, coachId }, select: { id: true, status: true, scheduledAt: true, focus: true, student: { select: { userId: true, user: { select: { timezone: true } } } } } });
  if (!m) throw new UserError("Session not found.");
  if (m.status !== "OPEN" && m.status !== "SCHEDULED") throw new UserError("This session is already closed.");
  const coach = await db.employeeProfile.findUniqueOrThrow({ where: { id: coachId }, select: { user: { select: { name: true } } } });
  await db.mockInterview.update({ where: { id: m.id }, data: { status: "CANCELLED", feedback: input.reason || null } });
  await audit({ actorId: ctx.user.id, action: "coach.session_cancelled", entity: "MockInterview", entityId: m.id, before: { status: m.status }, after: { status: "CANCELLED", reason: input.reason ?? null } });
  if (m.student) {
    await notify(m.student.userId, "mock_session_cancelled", {
      coach: firstName(coach.user.name),
      focus: m.focus,
      when: `${formatInTz(m.scheduledAt, m.student.user.timezone, "EEE d MMM, h:mm a")} (your time)`,
      reason: input.reason || null,
    }).catch(() => undefined);
  }
  return { ok: true };
}

// ─────────────────────────── Record outcome ───────────────────────────

export const coachScorecardSchema = z.object({
  id: z.string().min(1),
  outcome: z.enum(["DONE", "NO_SHOW"]),
  scores: z
    .object({
      communication: z.coerce.number().int().min(1).max(5),
      technical: z.coerce.number().int().min(1).max(5),
      structure: z.coerce.number().int().min(1).max(5),
      confidence: z.coerce.number().int().min(1).max(5),
    })
    .optional()
    .nullable(),
  feedback: z.string().trim().max(5000).optional().nullable(),
  /** Private to coaches/admins — never shown to the student. */
  notes: z.string().trim().max(5000).optional().nullable(),
});
export type CoachScorecardInput = z.input<typeof coachScorecardSchema>;

export async function recordSessionOutcome(ctx: CoachContext, raw: CoachScorecardInput) {
  const coachId = mine(ctx);
  const input = coachScorecardSchema.parse(raw);
  const m = await db.mockInterview.findFirst({ where: { id: input.id, coachId }, select: { id: true, status: true, studentId: true, focus: true, student: { select: { userId: true } } } });
  if (!m) throw new UserError("Session not found.");
  if (!m.studentId) throw new UserError("Nobody booked this slot. Cancel it instead.");
  if (m.status !== "SCHEDULED") throw new UserError("This session already has an outcome.");
  if (input.outcome === "DONE" && !input.scores) throw new UserError("Fill in the scorecard.", "scores");
  await db.mockInterview.update({
    where: { id: m.id },
    data: { status: input.outcome, scores: input.outcome === "DONE" ? (input.scores as Prisma.InputJsonValue) : Prisma.DbNull, feedback: input.feedback || null, notes: input.notes || null },
  });
  await audit({ actorId: ctx.user.id, action: `coach.session_${input.outcome.toLowerCase()}`, entity: "MockInterview", entityId: m.id, before: { status: m.status }, after: { status: input.outcome, scores: input.scores ?? null } });
  if (input.outcome === "DONE" && m.student) {
    await notify(m.student.userId, "generic", { title: "Your mock interview feedback is ready", body: `Scores and notes for "${m.focus ?? "your mock interview"}" are now on your Prep page.`, link: "/app/prep" }).catch(() => undefined);
  }
  return { ok: true };
}

// ─────────────────────────── Applicants (coachees) ───────────────────────────

/** Students assigned to me plus anyone with a non-cancelled session with me. */
export async function listCoachees(ctx: CoachContext, now = new Date()) {
  if (!ctx.employeeId) return [];
  const coachId = ctx.employeeId;
  const students = await db.studentProfile.findMany({
    where: { user: { deletedAt: null }, OR: [{ coachId }, { mockInterviews: { some: { coachId, status: { not: "CANCELLED" } } } }] },
    orderBy: { user: { name: "asc" } },
    select: {
      id: true,
      coachId: true,
      targetTitles: true,
      user: { select: { name: true, timezone: true } },
      mockInterviews: { where: { coachId, status: { not: "CANCELLED" } }, orderBy: { scheduledAt: "desc" }, select: { id: true, scheduledAt: true, status: true, scores: true, focus: true } },
    },
  });
  return students.map((s) => {
    const next = [...s.mockInterviews].reverse().find((m) => m.status === "SCHEDULED" && m.scheduledAt >= new Date(now.getTime() - 2 * 3600e3)) ?? null;
    const last = s.mockInterviews.find((m) => m.status === "DONE") ?? null;
    return {
      id: s.id,
      name: s.user.name,
      timezone: s.user.timezone,
      assigned: s.coachId === coachId,
      targetTitles: s.targetTitles,
      sessions: s.mockInterviews.length,
      next: next ? { id: next.id, scheduledAt: next.scheduledAt, focus: next.focus } : null,
      last: last ? { id: last.id, scheduledAt: last.scheduledAt, focus: last.focus, scores: parseScores(last.scores) } : null,
    };
  });
}

/** Just the students I may schedule directly (assigned to me). */
export async function listMyCoachees(ctx: CoachContext) {
  if (!ctx.employeeId) return [];
  const rows = await db.studentProfile.findMany({ where: { coachId: ctx.employeeId, user: { deletedAt: null, status: { not: "DEACTIVATED" } } }, orderBy: { user: { name: "asc" } }, select: { id: true, user: { select: { name: true, timezone: true } } } });
  return rows.map((r) => ({ id: r.id, name: r.user.name, timezone: r.user.timezone }));
}

/** One applicant's session history + scorecards (coach-safe slice: no vault, applications, resumes or messages). */
export async function getCoacheeDetail(ctx: CoachContext, studentId: string) {
  await assertCoachCanAccessStudent({ role: ctx.user.role, employeeId: ctx.employeeId }, studentId);
  const s = await db.studentProfile.findUnique({
    where: { id: studentId },
    select: { id: true, coachId: true, targetTitles: true, seniority: true, industries: true, user: { select: { name: true, timezone: true } }, market: { select: { code: true } } },
  });
  if (!s) return null;
  const where: Prisma.MockInterviewWhereInput = ctx.employeeId ? { studentId, coachId: ctx.employeeId } : { studentId };
  const sessions = await db.mockInterview.findMany({ where, orderBy: { scheduledAt: "desc" }, take: 100, select: SESSION_SELECT });
  return {
    id: s.id,
    name: s.user.name,
    timezone: s.user.timezone,
    market: s.market.code,
    assigned: Boolean(ctx.employeeId) && s.coachId === ctx.employeeId,
    targetTitles: s.targetTitles,
    seniority: s.seniority,
    industries: s.industries,
    sessions: sessions.map(shape),
  };
}

// ─────────────────────────── Profile ───────────────────────────

export async function getCoachProfile(user: CoachActor) {
  const u = await db.user.findUnique({
    where: { id: user.id },
    select: { name: true, email: true, phone: true, timezone: true, role: true, totpEnabled: true, lastLoginAt: true, employee: { select: { employeeCode: true, title: true, joiningDate: true } } },
  });
  if (!u) throw new ForbiddenError();
  return u;
}

// ─────────────────────────── Admin: assign a coach ───────────────────────────

/** Active interview coaches for the admin picker. */
export async function listCoachOptions() {
  const rows = await db.employeeProfile.findMany({
    where: { user: { role: "COACH", deletedAt: null, status: { not: "DEACTIVATED" } } },
    orderBy: { user: { name: "asc" } },
    select: { id: true, employeeCode: true, user: { select: { name: true, status: true } }, _count: { select: { coachees: true } } },
  });
  return rows.map((r) => ({ id: r.id, code: r.employeeCode, name: r.user.name, status: r.user.status, coachees: r._count.coachees }));
}

export const assignCoachSchema = z.object({ studentId: z.string().min(1), coachId: z.string().min(1).nullable() });

/** Set or clear a student's interview coach (ADMIN/MANAGER, action "coach.assign"). Notifies both sides. */
export async function assignCoach(actorId: string, raw: z.input<typeof assignCoachSchema>) {
  const input = assignCoachSchema.parse(raw);
  const s = await db.studentProfile.findUnique({ where: { id: input.studentId }, select: { id: true, userId: true, coachId: true, user: { select: { name: true } } } });
  if (!s) throw new UserError("Student not found.");
  if (s.coachId === input.coachId) return { ok: true, changed: false };
  let coach: { id: string; userId: string; user: { name: string } } | null = null;
  if (input.coachId) {
    coach = await db.employeeProfile.findFirst({ where: { id: input.coachId, user: { role: "COACH", deletedAt: null, status: { not: "DEACTIVATED" } } }, select: { id: true, userId: true, user: { select: { name: true } } } });
    if (!coach) throw new UserError("Pick an active interview coach.", "coachId");
  }
  await db.studentProfile.update({ where: { id: s.id }, data: { coachId: coach?.id ?? null } });
  await audit({ actorId, action: coach ? "coach.assigned" : "coach.unassigned", entity: "StudentProfile", entityId: s.id, before: { coachId: s.coachId }, after: { coachId: coach?.id ?? null } });
  if (coach) {
    await notify(s.userId, "coach_assigned", { coachFirstName: firstName(coach.user.name) }).catch(() => undefined);
    await notify(coach.userId, "generic", { title: `New applicant: ${s.user.name}`, body: `${s.user.name} has been assigned to you for mock interviews. Schedule a session when you're ready.`, link: `/coach/applicants/${s.id}` }).catch(() => undefined);
  }
  return { ok: true, changed: true };
}
