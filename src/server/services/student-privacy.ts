import "server-only";
import { crc32, deflateRawSync } from "node:zlib";
import type { Role } from "@/generated/prisma/enums";
import { db, Prisma } from "@/server/db";
import { ForbiddenError } from "@/server/auth/access";
import { UserError } from "@/server/errors";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { changePasswordSchema, STUDENT_EMAIL_PREFS } from "@/lib/schemas/student";
import { checkPasswordPolicy } from "./accounts";
import { readObject } from "./files";
import { audit } from "./audit";
import { enforceRateLimit } from "./ratelimit";
import type { NotificationPrefs } from "./notify";

/**
 * /app/settings (SPEC §10 privacy): password change, email notification
 * preferences, data export (JSON + files ZIP, secrets excluded) and the
 * account deletion request (admin confirms; 30-day soft delete).
 */

type Actor = { id: string; role: Role };

async function ownStudent(user: Actor) {
  if (user.role !== "STUDENT") throw new ForbiddenError();
  const s = await db.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!s) throw new ForbiddenError();
  return s.id;
}

// ─────────────────────────── Password ───────────────────────────

export async function changePassword(user: Actor, raw: { current?: string; password: string; confirm: string }) {
  const input = changePasswordSchema.parse(raw);
  const u = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true, email: true, name: true } });
  if (!u) throw new ForbiddenError();
  await enforceRateLimit("passwordReset", `change:${user.id}`);
  // Google-only accounts have no password yet: they may set one without "current".
  if (u.passwordHash && !(await verifyPassword(u.passwordHash, input.current))) throw new UserError("Your current password isn't right.", "current");
  if (u.passwordHash && (await verifyPassword(u.passwordHash, input.password))) throw new UserError("Choose a password you haven't used here before.", "password");
  await checkPasswordPolicy(input.password, [u.email, u.name]);
  // Changing the password signs out every other device (D-124); the caller re-adopts the version on this one.
  const updated = await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.password), sessionVersion: { increment: 1 } }, select: { sessionVersion: true } });
  await audit({ actorId: user.id, action: "user.password_changed", entity: "User", entityId: user.id });
  return { hadPassword: Boolean(u.passwordHash), sessionVersion: updated.sessionVersion };
}

export async function hasPassword(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  return Boolean(u?.passwordHash);
}

// ─────────────────────────── Notification preferences ───────────────────────────

export async function getEmailPrefs(user: Actor) {
  const u = await db.user.findUnique({ where: { id: user.id }, select: { notificationPrefs: true } });
  const prefs = (u?.notificationPrefs ?? {}) as NotificationPrefs;
  return Object.fromEntries(STUDENT_EMAIL_PREFS.map((k) => [k, prefs.emailAll !== false && prefs.email?.[k] !== false])) as Record<(typeof STUDENT_EMAIL_PREFS)[number], boolean>;
}

/** Stored as User.notificationPrefs = { email: { type: bool } } (read by notify()). */
export async function saveEmailPrefs(user: Actor, raw: Record<string, unknown>) {
  await ownStudent(user);
  const email: Record<string, boolean> = {};
  for (const k of STUDENT_EMAIL_PREFS) email[k] = raw[k] === true;
  const u = await db.user.findUnique({ where: { id: user.id }, select: { notificationPrefs: true } });
  const prev = (u?.notificationPrefs ?? {}) as NotificationPrefs & Record<string, unknown>;
  const next = { ...prev, emailAll: true, email: { ...(prev.email ?? {}), ...email } };
  await db.user.update({ where: { id: user.id }, data: { notificationPrefs: next as Prisma.InputJsonValue } });
  return email;
}

// ─────────────────────────── Data export ───────────────────────────

/**
 * Everything we hold about the student, as plain JSON. Explicit `select`s so
 * no secret column (passwordHash, totpSecretEnc, *Enc vault values) can leak:
 * the vault is exported as metadata only (kind, label, login URL, dates).
 */
export async function buildStudentExport(user: Actor) {
  const studentId = await ownStudent(user);
  const [account, profile, subscriptions, payments, applications, resumes, credentials, accessLog, threads, mocks, notifications, files, logins, assignments] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { id: true, email: true, emailVerified: true, name: true, phone: true, timezone: true, locale: true, createdAt: true, lastLoginAt: true, notificationPrefs: true, deletionRequestedAt: true } }),
    db.studentProfile.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        market: { select: { code: true, name: true } },
        onboardingCompletedAt: true,
        linkedinUrl: true,
        githubUrl: true,
        portfolioUrl: true,
        workAuthorization: true,
        needsSponsorship: true,
        targetTitles: true,
        seniority: true,
        industries: true,
        locations: true,
        remoteOk: true,
        workModes: true,
        employmentTypes: true,
        minSalaryMinor: true,
        salaryCurrency: true,
        willingToRelocate: true,
        noticePeriod: true,
        avoidCompanies: true,
        targetCompanies: true,
        masterProfile: true,
        consentApplyOnBehalfAt: true,
        consentTermsAt: true,
        consentVersion: true,
        createdAt: true,
      },
    }),
    db.subscription.findMany({ where: { studentId }, select: { status: true, currentPeriodStart: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, createdAt: true, planPrice: { select: { interval: true, amountMinor: true, currency: true, dailyTarget: true, plan: { select: { name: true } } } } } }),
    db.payment.findMany({ where: { studentId }, select: { amountMinor: true, currency: true, status: true, invoiceNumber: true, taxMinor: true, refundedMinor: true, paidAt: true, createdAt: true } }),
    db.jobApplication.findMany({
      where: { studentId, status: { not: "DRAFT" } },
      orderBy: { appliedAt: "desc" },
      select: {
        id: true,
        companyName: true,
        jobTitle: true,
        jobUrl: true,
        location: true,
        workMode: true,
        employmentType: true,
        source: true,
        status: true,
        appliedAt: true,
        jdText: true,
        coverLetter: true,
        proofText: true,
        resumeVersionId: true,
        events: { select: { fromStatus: true, toStatus: true, note: true, at: true } },
        interviews: { select: { scheduledAt: true, timezone: true, round: true, mode: true, meetingLink: true, interviewers: true, prepNotes: true, outcome: true } },
      },
    }),
    db.resumeVersion.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, select: { id: true, kind: true, title: true, content: true, styleCode: true, templateCode: true, createdAt: true, pdfKey: true, docxKey: true } }),
    db.credential.findMany({ where: { studentId }, select: { kind: true, label: true, loginUrl: true, createdAt: true, updatedAt: true, deletedAt: true } }),
    db.credentialAccessLog.findMany({ where: { credential: { studentId } }, orderBy: { at: "desc" }, select: { action: true, at: true, credential: { select: { label: true } } } }),
    db.messageThread.findMany({ where: { studentId }, select: { createdAt: true, isActive: true, messages: { orderBy: { createdAt: "asc" }, select: { body: true, createdAt: true, readAt: true, senderId: true } } } }),
    db.mockInterview.findMany({ where: { studentId }, select: { scheduledAt: true, durationMin: true, status: true, focus: true, scores: true, feedback: true } }),
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 500, select: { type: true, title: true, body: true, createdAt: true, readAt: true } }),
    db.fileObject.findMany({ where: { OR: [{ studentId }, { ownerUserId: user.id }] }, select: { id: true, key: true, purpose: true, mime: true, size: true, filename: true, createdAt: true } }),
    db.loginEvent.findMany({ where: { userId: user.id }, orderBy: { at: "desc" }, take: 200, select: { at: true, ip: true, userAgent: true, success: true, reason: true } }),
    db.assignment.findMany({ where: { studentId }, select: { type: true, isActive: true, startsAt: true, endsAt: true, employee: { select: { user: { select: { name: true } } } } } }),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    format: "upayaind-student-export/1",
    note: "Saved logins (vault) are listed without usernames, passwords or notes: those are encrypted and never exported.",
    account,
    profile,
    subscriptions,
    payments,
    applications,
    resumes: resumes.map(({ pdfKey, docxKey, ...r }) => ({ ...r, hasPdf: Boolean(pdfKey), hasDocx: Boolean(docxKey) })),
    vault: { entries: credentials, accessLog: accessLog.map((l) => ({ action: l.action, at: l.at, credential: l.credential.label })) },
    messages: threads.map((t) => ({ startedAt: t.createdAt, isActive: t.isActive, messages: t.messages.map((m) => ({ fromMe: m.senderId === user.id, body: m.body, at: m.createdAt, readAt: m.readAt })) })),
    mockInterviews: mocks,
    notifications,
    assignments: assignments.map((a) => ({ type: a.type, isActive: a.isActive, startsAt: a.startsAt, endsAt: a.endsAt, specialist: a.employee.user.name.split(/\s+/)[0] })),
    loginHistory: logins,
    files: files.map(({ key: _key, ...f }) => {
      void _key;
      return f;
    }),
    _fileKeys: files.map((f) => ({ id: f.id, key: f.key, filename: f.filename, purpose: f.purpose })),
  };
}

const MAX_ZIP_FILES = 200;
const MAX_ZIP_BYTES = 200 * 1024 * 1024;

/** data.json + every stored file (uploads, resumes, proofs, invoices, attachments) as a ZIP. */
export async function buildStudentExportZip(user: Actor, ip?: string | null) {
  await enforceRateLimit("upload", `export:${user.id}`, { tokens: 5 });
  const data = await buildStudentExport(user);
  const { _fileKeys, ...json } = data;
  const entries: ZipEntry[] = [{ name: "data.json", data: Buffer.from(JSON.stringify(json, null, 2), "utf8") }];
  let total = 0;
  const skipped: string[] = [];
  for (const f of _fileKeys.slice(0, MAX_ZIP_FILES)) {
    try {
      const buf = await readObject(f.key);
      if (total + buf.length > MAX_ZIP_BYTES) {
        skipped.push(f.filename ?? f.id);
        continue;
      }
      total += buf.length;
      const ext = f.key.split(".").pop() ?? "bin";
      const base = (f.filename ?? `${f.id}.${ext}`).replace(/[^\w.\- ()]+/g, "_");
      entries.push({ name: `files/${f.purpose}/${base}`, data: buf });
    } catch {
      skipped.push(f.filename ?? f.id);
    }
  }
  if (skipped.length) entries.push({ name: "files/README.txt", data: Buffer.from(`Some files could not be included (missing or too large): ${skipped.join(", ")}.\nAsk support@upayaind.com if you need them.\n`) });
  await audit({ actorId: user.id, action: "privacy.data_export", entity: "User", entityId: user.id, after: { files: entries.length - 1 }, ip });
  return buildZip(entries);
}

// ─────────────────────────── Account deletion ───────────────────────────

/** Request deletion (SPEC §10): an admin confirms; then a 30-day soft delete and purge. */
export async function requestAccountDeletion(user: Actor, confirmEmail: string) {
  await ownStudent(user);
  const u = await db.user.findUnique({ where: { id: user.id }, select: { email: true, deletionRequestedAt: true } });
  if (!u) throw new ForbiddenError();
  if (u.email.toLowerCase() !== confirmEmail.trim().toLowerCase()) throw new UserError("Type your account email exactly to confirm.", "confirmEmail");
  if (u.deletionRequestedAt) return u.deletionRequestedAt;
  const now = new Date();
  await db.user.update({ where: { id: user.id }, data: { deletionRequestedAt: now } });
  await audit({ actorId: user.id, action: "privacy.deletion_requested", entity: "User", entityId: user.id });
  return now;
}

export async function cancelAccountDeletion(user: Actor) {
  await ownStudent(user);
  await db.user.update({ where: { id: user.id }, data: { deletionRequestedAt: null } });
  await audit({ actorId: user.id, action: "privacy.deletion_cancelled", entity: "User", entityId: user.id });
}

export async function getDeletionState(user: Actor) {
  const u = await db.user.findUnique({ where: { id: user.id }, select: { deletionRequestedAt: true } });
  return u?.deletionRequestedAt ?? null;
}

// ─────────────────────────── ZIP writer ───────────────────────────

export type ZipEntry = { name: string; data: Buffer; date?: Date };

function dosTime(d: Date) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/**
 * Tiny ZIP writer (deflate or store, no ZIP64) so the export needs no archive
 * dependency. Limits: < 4 GB and < 65,535 entries (the export stays far below).
 */
export function buildZip(entries: ZipEntry[]): Buffer {
  const parts: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const seen = new Set<string>();
  for (const e of entries) {
    const clean = e.name.replace(/\\/g, "/").replace(/^\/+/, "").replace(/(^|\/)\.\.(\/|$)/g, "$1");
    let name = clean;
    for (let i = 2; seen.has(name); i++) name = clean.replace(/(\.[^./]+)?$/, ` (${i})$1`);
    seen.add(name);
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(e.data) >>> 0;
    const deflated = deflateRawSync(e.data);
    const useDeflate = deflated.length < e.data.length;
    const body = useDeflate ? deflated : e.data;
    const method = useDeflate ? 8 : 0;
    const { time, date } = dosTime(e.date ?? new Date());

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    parts.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}
