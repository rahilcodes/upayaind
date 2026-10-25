import "server-only";
import { z } from "zod";
import type { Role } from "@/generated/prisma/enums";
import { db, type Tx } from "@/server/db";
import { emailSchema, passwordSchema, phoneSchema } from "@/lib/schemas/auth";
import { hashPassword } from "@/server/auth/password";
import { addDayKey, dateOnly, dayKey, dayRangeInTz, keyFromDateOnly, startOfDayInTz } from "@/lib/dates";
import { absoluteUrl } from "@/lib/utils";
import { UserError } from "@/server/errors";
import { emit } from "@/server/jobs";
import { checkPasswordPolicy } from "./accounts";
import { audit } from "./audit";
import { issueToken } from "./auth-tokens";
import { sendEmail } from "./email";
import { getSetting } from "./settings";
import { readSchedule, todayTargets } from "./admin-metrics";
import { windowHours } from "./work-window";

/**
 * Employee administration (SPEC §11 Employees, F2 re-homing on deactivation).
 * Managers may create/edit EMPLOYEEs; only ADMIN can create or promote MANAGERs.
 */

/** User-safe error (a UserError, so safeAction shows the message and field). */
export class EmployeeAdminError extends UserError {}

type Actor = { id: string; role: Role };

export const EMPLOYEE_CODE_PREFIX = "UPY-";
export const formatEmployeeCode = (n: number) => `${EMPLOYEE_CODE_PREFIX}${String(n).padStart(4, "0")}`;

/**
 * Next employee code UPY-#### from the `employee_code` Counter row (atomic
 * UPDATE … RETURNING). The first call continues after the highest existing code.
 */
export async function nextEmployeeCode(tx: Tx | typeof db = db): Promise<string> {
  const key = "employee_code";
  for (let attempt = 0; attempt < 5; attempt++) {
    const updated = await tx.$queryRaw<{ value: number }[]>`UPDATE "Counter" SET "value" = "value" + 1 WHERE "key" = ${key} RETURNING "value"`;
    let value = updated[0]?.value;
    if (value === undefined) {
      const inserted = await tx.$queryRaw<{ value: number }[]>`
        INSERT INTO "Counter" ("key", "value")
        VALUES (${key}, COALESCE((SELECT MAX(CAST(SUBSTRING("employeeCode" FROM '^UPY-([0-9]+)$') AS INTEGER)) FROM "EmployeeProfile"), 0) + 1)
        ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1
        RETURNING "value"`;
      value = inserted[0]!.value;
    }
    const code = formatEmployeeCode(Number(value));
    // Skip codes that were set by hand (imports / seed).
    const clash = await tx.employeeProfile.findUnique({ where: { employeeCode: code }, select: { id: true } });
    if (!clash) return code;
  }
  throw new EmployeeAdminError("Couldn't allocate an employee code. Please try again.");
}

const tzSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone.");

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm, e.g. 09:30.");

/**
 * Working window (D-139): clock-in → clock-out in the window's own zone.
 * `hours` is derived (windows may cross midnight); `enforceWindow` gates
 * clock-in and application logging.
 */
const scheduleSchema = z
  .object({
    days: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Pick at least one working day.").max(7),
    startTime: hhmm,
    endTime: hhmm,
    timezone: tzSchema.default("America/New_York"),
    enforceWindow: z.boolean().default(false),
  })
  .transform((s) => ({ ...s, hours: windowHours(s.startTime, s.endTime) }))
  .refine((s) => s.hours >= 1, { message: "The window must be at least 1 hour.", path: ["endTime"] })
  .refine((s) => s.hours <= 14, { message: "The window can be at most 14 hours.", path: ["endTime"] });

export const employeeInputSchema = z.object({
  name: z.string().trim().min(2, "Enter the full name.").max(120),
  email: emailSchema,
  phone: z.union([z.literal("").transform(() => null), phoneSchema("IN")]).nullable().optional(),
  title: z.string().trim().max(120).optional().nullable(),
  marketIds: z.array(z.string().min(1)).min(1, "Pick at least one market."),
  maxStudents: z.coerce.number().int().min(0).max(100).optional(),
  managerId: z.string().min(1).nullable().optional(),
  timezone: tzSchema.default("Asia/Kolkata"),
  schedule: scheduleSchema,
  role: z.enum(["EMPLOYEE", "MANAGER", "TEAM_LEAD", "COACH"]).default("EMPLOYEE"),
  acceptingNewStudents: z.boolean().default(true),
  /** "invite": emailed link to choose a password (default). "password": the admin sets one now (D-153). */
  mode: z.enum(["invite", "password"]).default("invite"),
  password: z.string().max(128).optional().nullable(),
});
export const setStaffPasswordSchema = z.object({ password: z.string().max(128), signOutOthers: z.boolean().default(true) });
export type EmployeeInput = z.input<typeof employeeInputSchema>;

async function sendInviteEmail(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true, status: true } });
  if (!user) throw new EmployeeAdminError("Employee not found.");
  if (user.status !== "INVITED") throw new EmployeeAdminError("This person has already activated their account.");
  const token = await issueToken(userId, "INVITE");
  const url = absoluteUrl(`/invite?token=${encodeURIComponent(token)}`);
  await sendEmail({
    to: user.email,
    subject: "You're invited to UpayaInd",
    content: {
      preview: "Set your password and turn on two-factor sign-in to start.",
      heading: `Welcome to UpayaInd, ${user.name.split(/\s+/)[0]}`,
      paragraphs: [
        "Your UpayaInd staff account is ready. Set a password to activate it — you'll then set up two-factor sign-in with an authenticator app.",
        "This link is valid for 7 days and can be used once.",
      ],
      cta: { label: "Activate my account", href: url },
      footnote: "If you weren't expecting this email, you can ignore it.",
    },
  });
  return { url };
}

async function validateRefs(input: z.infer<typeof employeeInputSchema>, selfEmployeeId?: string) {
  const markets = await db.market.count({ where: { id: { in: input.marketIds } } });
  if (markets !== input.marketIds.length) throw new EmployeeAdminError("One of the selected markets doesn't exist.", "marketIds");
  if (input.managerId) {
    if (input.managerId === selfEmployeeId) throw new EmployeeAdminError("An employee can't be their own manager.", "managerId");
    const m = await db.employeeProfile.findUnique({ where: { id: input.managerId }, select: { user: { select: { role: true, status: true } } } });
    if (!m || !["MANAGER", "TEAM_LEAD", "ADMIN"].includes(m.user.role) || m.user.status === "DEACTIVATED") throw new EmployeeAdminError("Pick an active manager.", "managerId");
  }
}

/** Password mode: tell the person where to log in (the password itself is never emailed). */
async function sendStaffLoginDetailsEmail(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  if (!user) return;
  await sendEmail({
    to: user.email,
    subject: "Your UpayaInd staff account is ready",
    content: {
      preview: "Log in with the email and password your admin gave you.",
      heading: `Welcome to UpayaInd, ${user.name.split(/\s+/)[0]}`,
      paragraphs: [
        `Your staff account for ${user.email} is ready. Log in with the password your admin shared with you; you may be asked to set up two-step verification on first login.`,
        "You can change your password any time from your profile.",
      ],
      cta: { label: "Log in", href: absoluteUrl("/login?team=1") },
      footnote: "If you weren't expecting this email, you can ignore it.",
    },
  }).catch((e) => console.error("[employees] login details email failed", e));
}

async function hashNewPassword(raw: string | null | undefined, inputs: string[]) {
  const pw = passwordSchema.safeParse(raw ?? "");
  if (!pw.success) throw new EmployeeAdminError(pw.error.issues[0]?.message ?? "Enter a password.", "password");
  await checkPasswordPolicy(pw.data, inputs);
  return hashPassword(pw.data);
}

/** Create an employee (EmployeeProfile + User): INVITED with an emailed link, or ACTIVE with a password the admin set (D-153). */
export async function createEmployee(actor: Actor, raw: EmployeeInput) {
  const input = employeeInputSchema.parse(raw);
  if ((input.role === "MANAGER" || input.role === "TEAM_LEAD") && actor.role !== "ADMIN") throw new EmployeeAdminError("Only an admin can create a manager or team lead.", "role");
  await validateRefs(input);
  const exists = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (exists) throw new EmployeeAdminError("An account with this email already exists.", "email");
  const passwordHash = input.mode === "password" ? await hashNewPassword(input.password, [input.name, input.email]) : null;
  // Interview coaches never take application load (D-140).
  const coach = input.role === "COACH";
  const maxStudents = coach ? 0 : (input.maxStudents ?? (await getSetting("defaultMaxStudents")));
  const acceptingNewStudents = coach ? false : input.acceptingNewStudents;

  const created = await db.$transaction(async (tx) => {
    const employeeCode = await nextEmployeeCode(tx);
    const user = await tx.user.create({
      data: {
        email: input.email,
        name: input.name,
        phone: input.phone ?? null,
        role: input.role,
        status: passwordHash ? "ACTIVE" : "INVITED",
        passwordHash,
        emailVerified: passwordHash ? new Date() : null,
        timezone: input.timezone,
        employee: {
          create: {
            employeeCode,
            title: input.title || null,
            marketIds: input.marketIds,
            maxStudents,
            acceptingNewStudents,
            managerId: input.managerId ?? null,
            workSchedule: input.schedule,
            joiningDate: new Date(),
          },
        },
      },
      select: { id: true, employee: { select: { id: true, employeeCode: true } } },
    });
    await audit({ actorId: actor.id, action: "employee.create", entity: "EmployeeProfile", entityId: user.employee!.id, after: { email: input.email, name: input.name, role: input.role, employeeCode, marketIds: input.marketIds, maxStudents, workSchedule: input.schedule, mode: input.mode } }, tx);
    return { userId: user.id, employeeId: user.employee!.id, employeeCode };
  });
  if (passwordHash) await sendStaffLoginDetailsEmail(created.userId);
  else await sendInviteEmail(created.userId);
  return { ...created, mode: input.mode };
}

/** Set or replace a staff member's password (D-153). Managers may do it for specialists/coaches; managers and team leads need an ADMIN. */
export async function setEmployeePassword(actor: Actor, employeeId: string, raw: z.input<typeof setStaffPasswordSchema>) {
  const v = setStaffPasswordSchema.parse(raw);
  const e = await db.employeeProfile.findUnique({ where: { id: employeeId }, select: { userId: true, user: { select: { role: true, status: true, name: true, email: true, emailVerified: true } } } });
  if (!e) throw new EmployeeAdminError("Employee not found.");
  if (e.user.role === "ADMIN" || ((e.user.role === "MANAGER" || e.user.role === "TEAM_LEAD") && actor.role !== "ADMIN")) throw new EmployeeAdminError("Only an admin can set this account's password.");
  if (e.user.status === "DEACTIVATED") throw new EmployeeAdminError("Reactivate the account first.");
  if (e.userId === actor.id) throw new EmployeeAdminError("Change your own password from your profile.");
  const passwordHash = await hashNewPassword(v.password, [e.user.name, e.user.email]);
  const now = new Date();
  const status = e.user.status === "INVITED" ? "ACTIVE" : e.user.status;
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: e.userId }, data: { passwordHash, status, emailVerified: e.user.emailVerified ?? now, ...(v.signOutOthers ? { sessionVersion: { increment: 1 } } : {}) } });
    await tx.authToken.updateMany({ where: { userId: e.userId, consumedAt: null, type: { in: ["RESET_PASSWORD", "INVITE"] } }, data: { consumedAt: now } });
    await audit({ actorId: actor.id, action: "employee.password_set", entity: "EmployeeProfile", entityId: employeeId, before: { status: e.user.status }, after: { status, sessionsRevoked: v.signOutOthers } }, tx);
  });
  return { ok: true, status };
}

export async function resendInvite(actor: Actor, employeeId: string) {
  const e = await db.employeeProfile.findUnique({ where: { id: employeeId }, select: { userId: true, user: { select: { role: true } } } });
  if (!e) throw new EmployeeAdminError("Employee not found.");
  if (e.user.role === "ADMIN" || ((e.user.role === "MANAGER" || e.user.role === "TEAM_LEAD") && actor.role !== "ADMIN")) throw new EmployeeAdminError("Only an admin can manage this account.");
  await sendInviteEmail(e.userId);
  await audit({ actorId: actor.id, action: "employee.invite_resent", entity: "EmployeeProfile", entityId: employeeId });
  return { ok: true };
}

export const employeeUpdateSchema = employeeInputSchema.omit({ email: true }).extend({ employeeId: z.string().min(1) });

export async function updateEmployee(actor: Actor, raw: z.input<typeof employeeUpdateSchema>) {
  const input = employeeUpdateSchema.parse(raw);
  const before = await db.employeeProfile.findUnique({
    where: { id: input.employeeId },
    select: { id: true, userId: true, title: true, marketIds: true, maxStudents: true, managerId: true, workSchedule: true, acceptingNewStudents: true, user: { select: { name: true, phone: true, role: true, timezone: true, status: true } } },
  });
  if (!before) throw new EmployeeAdminError("Employee not found.");
  if (before.user.role === "ADMIN") throw new EmployeeAdminError("Admin accounts can't be edited here.");
  if (actor.role !== "ADMIN" && (before.user.role === "MANAGER" || before.user.role === "TEAM_LEAD" || input.role === "MANAGER" || input.role === "TEAM_LEAD")) throw new EmployeeAdminError("Only an admin can edit managers or team leads, or change roles to those.", "role");
  await validateRefs({ ...input, email: "x@x.x" } as z.infer<typeof employeeInputSchema>, input.employeeId);
  const coach = input.role === "COACH";
  const maxStudents = coach ? 0 : (input.maxStudents ?? before.maxStudents);
  const acceptingNewStudents = coach ? false : input.acceptingNewStudents;

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: before.userId }, data: { name: input.name, phone: input.phone ?? null, role: input.role, timezone: input.timezone } });
    await tx.employeeProfile.update({
      where: { id: input.employeeId },
      data: { title: input.title || null, marketIds: input.marketIds, maxStudents, managerId: input.managerId ?? null, workSchedule: input.schedule, acceptingNewStudents },
    });
    await audit(
      {
        actorId: actor.id,
        action: before.user.role !== input.role ? "employee.role_change" : "employee.update",
        entity: "EmployeeProfile",
        entityId: input.employeeId,
        before: { name: before.user.name, phone: before.user.phone, role: before.user.role, timezone: before.user.timezone, title: before.title, marketIds: before.marketIds, maxStudents: before.maxStudents, managerId: before.managerId, workSchedule: before.workSchedule, acceptingNewStudents: before.acceptingNewStudents },
        after: { name: input.name, phone: input.phone ?? null, role: input.role, timezone: input.timezone, title: input.title || null, marketIds: input.marketIds, maxStudents, managerId: input.managerId ?? null, workSchedule: input.schedule, acceptingNewStudents },
      },
      tx,
    );
  });
  return { ok: true };
}

/**
 * Deactivate: status DEACTIVATED, then emit `employee.deactivated` which
 * re-homes all their students through F2 (assignment job).
 */
export async function deactivateEmployee(actor: Actor, employeeId: string, reason: string) {
  const e = await db.employeeProfile.findUnique({ where: { id: employeeId }, select: { userId: true, user: { select: { role: true, status: true, name: true } } } });
  if (!e) throw new EmployeeAdminError("Employee not found.");
  if (e.userId === actor.id) throw new EmployeeAdminError("You can't deactivate your own account.");
  if (e.user.role === "ADMIN" || ((e.user.role === "MANAGER" || e.user.role === "TEAM_LEAD") && actor.role !== "ADMIN")) throw new EmployeeAdminError("Only an admin can deactivate this account.");
  if (e.user.status === "DEACTIVATED") throw new EmployeeAdminError("This employee is already deactivated.");
  const students = await db.assignment.count({ where: { employeeId, isActive: true, type: "PRIMARY" } });
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: e.userId }, data: { status: "DEACTIVATED", sessionVersion: { increment: 1 } } }); // also ends open sessions (D-124)
    await tx.employeeProfile.update({ where: { id: employeeId }, data: { acceptingNewStudents: false } });
    await tx.authToken.updateMany({ where: { userId: e.userId, consumedAt: null }, data: { consumedAt: new Date() } });
    await audit({ actorId: actor.id, action: "employee.deactivate", entity: "EmployeeProfile", entityId: employeeId, before: { status: e.user.status }, after: { status: "DEACTIVATED", reason, students } }, tx);
  });
  await emit("employee.deactivated", { employeeId, actorId: actor.id });
  return { students };
}

export async function reactivateEmployee(actor: Actor, employeeId: string) {
  const e = await db.employeeProfile.findUnique({ where: { id: employeeId }, select: { userId: true, user: { select: { role: true, status: true, passwordHash: true } } } });
  if (!e) throw new EmployeeAdminError("Employee not found.");
  if ((e.user.role === "MANAGER" || e.user.role === "TEAM_LEAD") && actor.role !== "ADMIN") throw new EmployeeAdminError("Only an admin can reactivate a manager or team lead.");
  if (e.user.status !== "DEACTIVATED") throw new EmployeeAdminError("This employee is already active.");
  const status = e.user.passwordHash ? "ACTIVE" : "INVITED";
  await db.user.update({ where: { id: e.userId }, data: { status } });
  await audit({ actorId: actor.id, action: "employee.reactivate", entity: "EmployeeProfile", entityId: employeeId, before: { status: "DEACTIVATED" }, after: { status } });
  return { status };
}

// ─────────────────────────── Lists & detail ───────────────────────────

/** Employee list with load, today's applications vs target and today's attendance. */
export async function listEmployees(opts: { q?: string; status?: string; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const statusFilter = opts.status === "DEACTIVATED" ? ["DEACTIVATED" as const] : opts.status === "INVITED" ? ["INVITED" as const] : opts.status === "all" ? undefined : ["ACTIVE" as const, "INVITED" as const];
  const emps = await db.employeeProfile.findMany({
    where: {
      user: {
        deletedAt: null,
        role: { in: ["EMPLOYEE", "MANAGER", "TEAM_LEAD", "COACH"] },
        ...(statusFilter ? { status: { in: statusFilter } } : {}),
        ...(opts.q ? { OR: [{ name: { contains: opts.q, mode: "insensitive" } }, { email: { contains: opts.q, mode: "insensitive" } }] } : {}),
      },
    },
    orderBy: { user: { name: "asc" } },
    select: {
      id: true,
      employeeCode: true,
      title: true,
      maxStudents: true,
      marketIds: true,
      acceptingNewStudents: true,
      user: { select: { id: true, name: true, email: true, role: true, status: true, timezone: true, lastLoginAt: true } },
      _count: { select: { assignments: { where: { isActive: true, type: "PRIMARY" } } } },
    },
  });
  if (!emps.length) return [];
  const ids = emps.map((e) => e.id);

  // Today per employee timezone (group employees by tz to keep it to a few queries).
  const byTz = new Map<string, string[]>();
  for (const e of emps) byTz.set(e.user.timezone, [...(byTz.get(e.user.timezone) ?? []), e.id]);
  const appliedToday = new Map<string, number>();
  const dayRows = new Map<string, { status: string; clockedMinutes: number }>();
  await Promise.all(
    [...byTz.entries()].map(async ([tz, eids]) => {
      const { start, end, key } = dayRangeInTz(now, tz);
      const [apps, days] = await Promise.all([
        db.jobApplication.groupBy({ by: ["employeeId"], where: { employeeId: { in: eids }, appliedAt: { gte: start, lt: end } }, _count: { _all: true } }),
        db.employeeDay.findMany({ where: { employeeId: { in: eids }, date: dateOnly(key) }, select: { employeeId: true, status: true, clockedMinutes: true } }),
      ]);
      for (const a of apps) appliedToday.set(a.employeeId, a._count._all);
      for (const d of days) dayRows.set(d.employeeId, d);
    }),
  );

  // Target today = sum of today's targets of their active-plan students (market working days, F10).
  const targets = new Map<string, number>();
  for (const r of await todayTargets(now)) if (r.employeeId) targets.set(r.employeeId, (targets.get(r.employeeId) ?? 0) + r.target);

  const [open, leaves] = await Promise.all([
    db.workSession.findMany({ where: { employeeId: { in: ids }, endedAt: null }, select: { employeeId: true, startedAt: true } }),
    db.leaveRequest.findMany({ where: { employeeId: { in: ids }, status: "APPROVED", fromDate: { lte: dateOnly(dayKey(now, "UTC")) }, toDate: { gte: dateOnly(dayKey(now, "UTC")) } }, select: { employeeId: true } }),
  ]);
  const openMap = new Map(open.map((o) => [o.employeeId, o.startedAt]));
  const onLeave = new Set(leaves.map((l) => l.employeeId));

  return emps.map((e) => ({
    id: e.id,
    code: e.employeeCode,
    title: e.title,
    name: e.user.name,
    email: e.user.email,
    role: e.user.role,
    status: e.user.status,
    accepting: e.acceptingNewStudents,
    marketIds: e.marketIds,
    active: e._count.assignments,
    max: e.maxStudents,
    appliedToday: appliedToday.get(e.id) ?? 0,
    targetToday: targets.get(e.id) ?? 0,
    clockedInSince: openMap.get(e.id) ?? null,
    attendance: openMap.has(e.id) ? ("IN" as const) : onLeave.has(e.id) ? ("ON_LEAVE" as const) : ((dayRows.get(e.id)?.status ?? null) as string | null),
    lastLoginAt: e.user.lastLoginAt,
  }));
}

export async function employeeFormOptions() {
  const [markets, managers, defaultMax] = await Promise.all([
    db.market.findMany({ orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
    db.employeeProfile.findMany({ where: { user: { role: { in: ["MANAGER", "TEAM_LEAD", "ADMIN"] }, status: { not: "DEACTIVATED" }, deletedAt: null } }, select: { id: true, user: { select: { name: true } } }, orderBy: { user: { name: "asc" } } }),
    getSetting("defaultMaxStudents"),
  ]);
  return { markets, managers: managers.map((m) => ({ id: m.id, name: m.user.name })), defaultMax };
}

export function avgMinutes(pairs: { createdAt: Date; appliedAt: Date | null }[]) {
  const diffs = pairs.filter((p) => p.appliedAt && p.appliedAt >= p.createdAt).map((p) => (p.appliedAt!.getTime() - p.createdAt.getTime()) / 60000);
  if (!diffs.length) return null;
  return diffs.reduce((a, b) => a + b, 0) / diffs.length;
}

/** Leave balance per active leave type for a calendar year (approved days used vs quota). */
export async function leaveBalance(employeeId: string, year: number) {
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));
  const [types, used, pending] = await Promise.all([
    db.leaveType.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, annualQuota: true, paid: true } }),
    db.leaveRequest.groupBy({ by: ["leaveTypeId"], where: { employeeId, status: "APPROVED", fromDate: { gte: from, lt: to } }, _sum: { days: true } }),
    db.leaveRequest.groupBy({ by: ["leaveTypeId"], where: { employeeId, status: "PENDING", fromDate: { gte: from, lt: to } }, _sum: { days: true } }),
  ]);
  const u = new Map(used.map((x) => [x.leaveTypeId, x._sum.days ?? 0]));
  const p = new Map(pending.map((x) => [x.leaveTypeId, x._sum.days ?? 0]));
  return types.map((t) => ({ id: t.id, name: t.name, quota: t.annualQuota, paid: t.paid, used: u.get(t.id) ?? 0, pending: p.get(t.id) ?? 0, remaining: Math.max(0, t.annualQuota - (u.get(t.id) ?? 0)) }));
}

type Period = { key: "today" | "week" | "month"; start: Date; end: Date; fromKey: string; toKey: string };

function periods(now: Date, tz: string): Period[] {
  const today = dayKey(now, tz);
  const wd = new Date(`${today}T00:00:00Z`).getUTCDay() || 7;
  const weekStart = addDayKey(today, -(wd - 1));
  const monthStart = `${today.slice(0, 7)}-01`;
  const end = startOfDayInTz(addDayKey(today, 1), tz);
  return [
    { key: "today", start: startOfDayInTz(today, tz), end, fromKey: today, toKey: today },
    { key: "week", start: startOfDayInTz(weekStart, tz), end, fromKey: weekStart, toKey: today },
    { key: "month", start: startOfDayInTz(monthStart, tz), end, fromKey: monthStart, toKey: today },
  ];
}

/** Employee page (SPEC §11): students + load, performance today/week/month, attendance, leave, logins. */
export async function getEmployeeDetail(employeeId: string, now = new Date()) {
  const e = await db.employeeProfile.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      employeeCode: true,
      title: true,
      marketIds: true,
      maxStudents: true,
      acceptingNewStudents: true,
      managerId: true,
      joiningDate: true,
      workSchedule: true,
      user: { select: { id: true, name: true, email: true, phone: true, role: true, status: true, timezone: true, lastLoginAt: true, createdAt: true, totpEnabled: true } },
    },
  });
  if (!e) return null;
  const tz = e.user.timezone;
  const ps = periods(now, tz);
  const monthFromKey = addDayKey(dayKey(now, tz), -41);

  const [assignments, manager, markets, logins, days, leave] = await Promise.all([
    db.assignment.findMany({
      where: { employeeId, isActive: true },
      orderBy: { startsAt: "desc" },
      select: {
        id: true,
        type: true,
        startsAt: true,
        endsAt: true,
        student: {
          select: {
            id: true,
            user: { select: { name: true, email: true } },
            market: { select: { code: true } },
            subscriptions: { where: { status: "ACTIVE" }, take: 1, select: { planPrice: { select: { dailyTarget: true, plan: { select: { name: true } } } } } },
          },
        },
      },
    }),
    e.managerId ? db.employeeProfile.findUnique({ where: { id: e.managerId }, select: { user: { select: { name: true } } } }) : null,
    db.market.findMany({ where: { id: { in: e.marketIds } }, select: { id: true, code: true, name: true } }),
    db.loginEvent.findMany({ where: { userId: e.user.id }, orderBy: { at: "desc" }, take: 20, select: { id: true, at: true, ip: true, userAgent: true, success: true, reason: true } }),
    db.employeeDay.findMany({ where: { employeeId, date: { gte: dateOnly(monthFromKey) } }, orderBy: { date: "asc" }, select: { date: true, status: true, clockedMinutes: true, activeMinutes: true, applications: true, clockInAt: true, clockOutAt: true } }),
    leaveBalance(employeeId, Number(dayKey(now, tz).slice(0, 4))),
  ]);

  const studentIds = assignments.filter((a) => a.type === "PRIMARY").map((a) => a.student.id);
  const { start: todayStart, end: todayEnd } = dayRangeInTz(now, tz);
  const todayCounts = studentIds.length
    ? await db.jobApplication.groupBy({ by: ["studentId"], where: { studentId: { in: studentIds }, appliedAt: { gte: todayStart, lt: todayEnd } }, _count: { _all: true } })
    : [];
  const todayMap = new Map(todayCounts.map((c) => [c.studentId, c._count._all]));

  const performance = await Promise.all(
    ps.map(async (p) => {
      const [apps, responded, interviews, gen, studentDays] = await Promise.all([
        db.jobApplication.count({ where: { employeeId, appliedAt: { gte: p.start, lt: p.end } } }),
        db.jobApplication.count({ where: { employeeId, appliedAt: { gte: p.start, lt: p.end }, status: { in: ["VIEWED", "RECRUITER_REPLIED", "ASSESSMENT", "INTERVIEW_SCHEDULED", "INTERVIEWING", "OFFER", "HIRED", "REJECTED"] } } }),
        db.interview.count({ where: { createdAt: { gte: p.start, lt: p.end }, application: { employeeId } } }),
        db.jobApplication.findMany({ where: { employeeId, appliedAt: { gte: p.start, lt: p.end }, resumeVersion: { kind: "TAILORED" } }, select: { appliedAt: true, resumeVersion: { select: { createdAt: true } } }, take: 2000 }),
        studentIds.length
          ? db.studentDay.findMany({ where: { studentId: { in: studentIds }, date: { gte: dateOnly(p.fromKey), lte: dateOnly(p.toKey) }, target: { gt: 0 } }, select: { applied: true, target: true } })
          : Promise.resolve([] as { applied: number; target: number }[]),
      ]);
      const pDays = days.filter((d) => {
        const k = keyFromDateOnly(d.date);
        return k >= p.fromKey && k <= p.toKey;
      });
      const workedDays = pDays.filter((d) => d.status === "PRESENT" || d.status === "HALF_DAY").length;
      const met = studentDays.filter((d) => d.applied >= d.target).length;
      return {
        key: p.key,
        applications: apps,
        perDay: workedDays ? apps / workedDays : apps,
        targetMetPct: studentDays.length ? Math.round((met / studentDays.length) * 100) : null,
        responseRate: apps ? Math.round((responded / apps) * 100) : null,
        interviews,
        avgGenToLogMin: avgMinutes(gen.map((g) => ({ createdAt: g.resumeVersion!.createdAt, appliedAt: g.appliedAt }))),
        activeMinutes: pDays.reduce((s, d) => s + d.activeMinutes, 0),
        clockedMinutes: pDays.reduce((s, d) => s + d.clockedMinutes, 0),
      };
    }),
  );

  return {
    id: e.id,
    code: e.employeeCode,
    title: e.title,
    maxStudents: e.maxStudents,
    accepting: e.acceptingNewStudents,
    joiningDate: e.joiningDate,
    managerId: e.managerId,
    managerName: manager?.user.name ?? null,
    schedule: readSchedule(e.workSchedule, e.user.timezone),
    markets,
    marketIds: e.marketIds,
    user: e.user,
    students: assignments.map((a) => ({
      assignmentId: a.id,
      type: a.type,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      id: a.student.id,
      name: a.student.user.name,
      email: a.student.user.email,
      market: a.student.market.code,
      plan: a.student.subscriptions[0]?.planPrice.plan.name ?? null,
      target: a.student.subscriptions[0]?.planPrice.dailyTarget ?? 0,
      today: todayMap.get(a.student.id) ?? 0,
    })),
    activeLoad: assignments.filter((a) => a.type === "PRIMARY").length,
    performance,
    days: days.map((d) => ({ ...d, key: keyFromDateOnly(d.date) })),
    calendarFromKey: monthFromKey,
    todayKey: dayKey(now, tz),
    leave,
    logins,
  };
}
