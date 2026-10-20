import "server-only";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { open, seal } from "@/server/crypto";
import { assertEmployeeCanAccessStudent, ForbiddenError, hasActiveAssignment } from "@/server/auth/access";
import { credentialSchema, credentialUpdateSchema, type CredentialInput, type CredentialUpdateInput } from "@/lib/schemas/student";
import { dayRangeInTz } from "@/lib/dates";
import { formatInTz } from "@/lib/format";
import { firstName } from "@/lib/utils";
import { audit } from "./audit";
import { notify } from "./notify";

/**
 * Credential vault (SPEC §10, F3 step 3).
 *
 * - Every secret column (username, password, notes) is envelope-encrypted with
 *   `seal()` (AES-256-GCM, per-record data key wrapped by VAULT_MASTER_KEY).
 * - Students manage only their own entries; they can reveal their own values
 *   (not logged as staff access — it's their data).
 * - Staff: ONLY the actively assigned EMPLOYEE can reveal / copy a secret, and
 *   every reveal/copy writes a CredentialAccessLog row + audit log.
 *   Managers/admins get metadata and logs, never secrets. Access ends the moment
 *   the assignment ends (checked on every call).
 * - The student gets a daily digest of staff access (credential_access_digest).
 */

export class VaultError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = "VaultError";
  }
}

type Actor = { id: string; role: Role };
export type RevealAction = "REVEAL" | "COPY_USERNAME" | "COPY_PASSWORD";
export const REVEAL_ACTIONS: RevealAction[] = ["REVEAL", "COPY_USERNAME", "COPY_PASSWORD"];

/** Never select *Enc columns here: this is what leaves the service. */
const META_SELECT = { id: true, kind: true, label: true, loginUrl: true, createdAt: true, updatedAt: true, notesEnc: true } as const;

export type CredentialMeta = {
  id: string;
  kind: string;
  label: string;
  loginUrl: string | null;
  hasNotes: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function toMeta(r: { id: string; kind: string; label: string; loginUrl: string | null; createdAt: Date; updatedAt: Date; notesEnc: string | null }): CredentialMeta {
  return { id: r.id, kind: r.kind, label: r.label, loginUrl: r.loginUrl, hasNotes: Boolean(r.notesEnc), createdAt: r.createdAt, updatedAt: r.updatedAt };
}

async function ownStudentId(user: Actor) {
  if (user.role !== "STUDENT") throw new ForbiddenError();
  const s = await db.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!s) throw new ForbiddenError();
  return s.id;
}

async function ownCredential(user: Actor, credentialId: string) {
  const studentId = await ownStudentId(user);
  const c = await db.credential.findFirst({ where: { id: credentialId, studentId, deletedAt: null }, select: { id: true, studentId: true, notesEnc: true } });
  if (!c) throw new VaultError("This login doesn't exist or was deleted.");
  return c;
}

// ─────────────────────────── Student side ───────────────────────────

/** The student's own entries (metadata only; values are masked until revealed). */
export async function listOwnCredentials(user: Actor): Promise<CredentialMeta[]> {
  const studentId = await ownStudentId(user);
  const rows = await db.credential.findMany({ where: { studentId, deletedAt: null }, orderBy: [{ createdAt: "asc" }], select: META_SELECT });
  return rows.map(toMeta);
}

export async function addCredential(user: Actor, raw: CredentialInput) {
  const input = credentialSchema.parse(raw);
  const studentId = await ownStudentId(user);
  const count = await db.credential.count({ where: { studentId, deletedAt: null } });
  if (count >= 30) throw new VaultError("You can store up to 30 logins.");
  const c = await db.credential.create({
    data: {
      studentId,
      kind: input.kind,
      label: input.label,
      loginUrl: input.loginUrl,
      usernameEnc: seal(input.username),
      passwordEnc: seal(input.password),
      notesEnc: input.notes ? seal(input.notes) : null,
    },
    select: { id: true },
  });
  await audit({ actorId: user.id, action: "vault.credential_added", entity: "Credential", entityId: c.id, after: { kind: input.kind, label: input.label } });
  return c;
}

/**
 * Update / rotate an entry. A blank password keeps the current one; a new
 * password is a rotation (audit-logged as such).
 */
export async function updateCredential(user: Actor, credentialId: string, raw: CredentialUpdateInput) {
  const input = credentialUpdateSchema.parse(raw);
  const existing = await ownCredential(user, credentialId);
  const rotate = Boolean(input.password);
  await db.credential.update({
    where: { id: existing.id },
    data: {
      kind: input.kind,
      label: input.label,
      loginUrl: input.loginUrl,
      usernameEnc: seal(input.username),
      ...(rotate ? { passwordEnc: seal(input.password!) } : {}),
      ...(input.keepNotes ? {} : { notesEnc: input.notes ? seal(input.notes) : null }),
    },
  });
  await audit({ actorId: user.id, action: rotate ? "vault.credential_rotated" : "vault.credential_updated", entity: "Credential", entityId: existing.id, after: { kind: input.kind, label: input.label } });
  return { id: existing.id, rotated: rotate };
}

/** Soft delete: the row stays (access logs keep pointing at it), secrets are wiped. */
export async function deleteCredential(user: Actor, credentialId: string) {
  const existing = await ownCredential(user, credentialId);
  await db.credential.update({ where: { id: existing.id }, data: { deletedAt: new Date(), usernameEnc: seal(""), passwordEnc: seal(""), notesEnc: null } });
  await audit({ actorId: user.id, action: "vault.credential_deleted", entity: "Credential", entityId: existing.id });
}

/** The student reveals their own entry (not logged as access; it's their data). */
export async function revealOwnCredential(user: Actor, credentialId: string) {
  const studentId = await ownStudentId(user);
  const c = await db.credential.findFirst({ where: { id: credentialId, studentId, deletedAt: null }, select: { usernameEnc: true, passwordEnc: true, notesEnc: true } });
  if (!c) throw new VaultError("This login doesn't exist or was deleted.");
  return { username: open(c.usernameEnc), password: open(c.passwordEnc), notes: c.notesEnc ? open(c.notesEnc) : null };
}

export type AccessLogRow = { id: string; at: Date; action: string; credentialLabel: string; credentialKind: string; by: string; byRole: Role | null };

/**
 * Who viewed/copied the student's logins. Students see staff first names
 * (SPEC §20); staff/admins see full names.
 */
export async function listAccessLog(viewer: Actor, studentId: string, opts: { take?: number } = {}): Promise<AccessLogRow[]> {
  if (viewer.role === "STUDENT") {
    if ((await ownStudentId(viewer)) !== studentId) throw new ForbiddenError();
  } else {
    await assertEmployeeCanAccessStudent(viewer, studentId);
  }
  const logs = await db.credentialAccessLog.findMany({
    where: { credential: { studentId } },
    orderBy: { at: "desc" },
    take: opts.take ?? 50,
    select: { id: true, at: true, action: true, userId: true, credential: { select: { label: true, kind: true } } },
  });
  const users = await db.user.findMany({ where: { id: { in: [...new Set(logs.map((l) => l.userId))] } }, select: { id: true, name: true, role: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  return logs.map((l) => {
    const u = byId.get(l.userId);
    const name = u ? (viewer.role === "STUDENT" ? firstName(u.name) : u.name) : "—";
    return { id: l.id, at: l.at, action: l.action, credentialLabel: l.credential.label, credentialKind: l.credential.kind, by: name, byRole: u?.role ?? null };
  });
}

// ─────────────────────────── Staff side ───────────────────────────

/**
 * Metadata for staff (employee with an active assignment, managers, admins).
 * `canReveal` is true only for the actively assigned employee.
 */
export async function listCredentialsForStaff(user: Actor, studentId: string): Promise<{ canReveal: boolean; credentials: CredentialMeta[] }> {
  if (user.role === "STUDENT") throw new ForbiddenError();
  await assertEmployeeCanAccessStudent(user, studentId);
  const rows = await db.credential.findMany({ where: { studentId, deletedAt: null }, orderBy: { createdAt: "asc" }, select: META_SELECT });
  return { canReveal: user.role === "EMPLOYEE", credentials: rows.map(toMeta) };
}

/**
 * Reveal or copy a secret (SPEC §10). ONLY the actively assigned EMPLOYEE
 * (managers/admins never see secrets). Every call is logged
 * (CredentialAccessLog + AuditLog) and returns the plaintext once.
 * - REVEAL → username + password + notes
 * - COPY_USERNAME → username
 * - COPY_PASSWORD → password
 */
export async function revealCredential(user: Actor, credentialId: string, action: RevealAction, ip?: string | null): Promise<{ username?: string; password?: string; notes?: string | null; hideAfterSeconds: number }> {
  if (!REVEAL_ACTIONS.includes(action)) throw new VaultError("Unknown action.");
  if (user.role !== "EMPLOYEE") throw new ForbiddenError("Only the applicant's assigned specialist can view saved logins.");
  const c = await db.credential.findFirst({ where: { id: credentialId, deletedAt: null }, select: { id: true, studentId: true, usernameEnc: true, passwordEnc: true, notesEnc: true } });
  if (!c) throw new VaultError("This login doesn't exist or was deleted.");
  const ep = await db.employeeProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!ep || !(await hasActiveAssignment(ep.id, c.studentId))) throw new ForbiddenError("This applicant isn't assigned to you.");

  await db.$transaction(async (tx) => {
    await tx.credentialAccessLog.create({ data: { credentialId: c.id, userId: user.id, action, ip: ip ?? null } });
    await audit({ actorId: user.id, action: `vault.${action.toLowerCase()}`, entity: "Credential", entityId: c.id, after: { studentId: c.studentId }, ip }, tx);
  });

  const out: { username?: string; password?: string; notes?: string | null; hideAfterSeconds: number } = { hideAfterSeconds: 30 };
  if (action === "REVEAL" || action === "COPY_USERNAME") out.username = open(c.usernameEnc);
  if (action === "REVEAL" || action === "COPY_PASSWORD") out.password = open(c.passwordEnc);
  if (action === "REVEAL") out.notes = c.notesEnc ? open(c.notesEnc) : null;
  return out;
}

// ─────────────────────────── Daily digest ───────────────────────────

const ACTION_WORD: Record<string, string> = { REVEAL: "viewed", COPY_USERNAME: "copied the username of", COPY_PASSWORD: "copied the password of" };

/**
 * Daily digest (SPEC §10): one email per student summarising staff access to
 * their logins "yesterday" (the previous calendar day in the student's time
 * zone; older un-digested rows are included too, so nothing is ever skipped).
 * Marks every included log row with digestSentAt. Idempotent.
 */
export async function runCredentialAccessDigest(now = new Date()) {
  const pending = await db.credentialAccessLog.findMany({
    where: { digestSentAt: null, at: { lt: now } },
    orderBy: { at: "asc" },
    select: { id: true, at: true, action: true, userId: true, credential: { select: { label: true, studentId: true, student: { select: { userId: true, user: { select: { timezone: true } } } } } } },
  });
  const byStudent = new Map<string, typeof pending>();
  for (const p of pending) {
    const tz = p.credential.student.user.timezone;
    // Only rows from before the start of "today" in the student's zone.
    if (p.at >= dayRangeInTz(now, tz).start) continue;
    const list = byStudent.get(p.credential.studentId) ?? [];
    list.push(p);
    byStudent.set(p.credential.studentId, list);
  }
  const staff = await db.user.findMany({ where: { id: { in: [...new Set(pending.map((p) => p.userId))] } }, select: { id: true, name: true } });
  const names = new Map(staff.map((s) => [s.id, firstName(s.name)]));

  let sent = 0;
  for (const rows of byStudent.values()) {
    const first = rows[0]!;
    const tz = first.credential.student.user.timezone;
    // "Arjun viewed LinkedIn (2×), copied the password of Application email."
    const groups = new Map<string, number>();
    for (const r of rows) {
      const k = `${names.get(r.userId) ?? "Your specialist"}|${ACTION_WORD[r.action] ?? "used"}|${r.credential.label}`;
      groups.set(k, (groups.get(k) ?? 0) + 1);
    }
    const parts = [...groups.entries()].map(([k, n]) => {
      const [who, verb, label] = k.split("|");
      return `${who} ${verb} ${label}${n > 1 ? ` (${n}×)` : ""}`;
    });
    const summary = `${parts.join("; ")}. Last access ${formatInTz(rows[rows.length - 1]!.at, tz, "d MMM, h:mm a")} your time. If you didn't expect this, rotate the password in your vault and message your specialist.`;
    // Claim first so a concurrent run can't double-send.
    const claimed = await db.credentialAccessLog.updateMany({ where: { id: { in: rows.map((r) => r.id) }, digestSentAt: null }, data: { digestSentAt: now } });
    if (!claimed.count) continue;
    await notify(first.credential.student.userId, "credential_access_digest", { summary, count: rows.length });
    sent++;
  }
  return { sent };
}
