import "server-only";
import { z } from "zod";
import type { Role } from "@/generated/prisma/enums";
import { db, Prisma } from "@/server/db";
import { hasActiveAssignment } from "@/server/auth/access";
import { firstName } from "@/lib/utils";
import { audit } from "./audit";
import { deleteObject, LIMITS, storeUpload } from "./files";
import { notify } from "./notify";
import { enforceRateLimit } from "./ratelimit";
import { isManagerial } from "@/server/auth/rbac";

/**
 * Messaging (SPEC F7).
 *
 * - One thread per (student, employee); the active thread follows the primary
 *   assignment (assignment.ensureThread). Old threads are read-only for the
 *   student and invisible to the previous employee (row-level rule, §3).
 * - A COVER employee (approved leave, F2) can read and write the student's
 *   active thread during the cover window.
 * - Managers/admins can read any thread (read-only; disclosed in the privacy policy).
 * - Read receipts: opening a thread sets `readAt` on the other side's messages.
 * - Unread messages are emailed once after 10 minutes (`runUnreadEmails`).
 * - Students only ever see their specialist's FIRST name (§20).
 */

export class MessagingError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = "MessagingError";
  }
}

type Actor = { id: string; role: Role };

export const MAX_BODY = 5000;
export const MAX_ATTACHMENTS = 3;
export const UNREAD_EMAIL_AFTER_MIN = 10;
/** Accepted attachment kinds (legacy .doc can't be verified by magic number; D-073). */
export const ATTACHMENT_KINDS = ["pdf", "docx", "png", "jpg"] as const;

const THREAD_SELECT = {
  id: true,
  studentId: true,
  employeeId: true,
  isActive: true,
  createdAt: true,
  student: { select: { userId: true, user: { select: { name: true } } } },
  employee: { select: { userId: true, user: { select: { name: true } } } },
} satisfies Prisma.MessageThreadSelect;
type ThreadRow = Prisma.MessageThreadGetPayload<{ select: typeof THREAD_SELECT }>;

export type ThreadAccess = { thread: ThreadRow; canWrite: boolean; side: "student" | "staff" | "observer" };

/**
 * Who may open a thread and whether they may write:
 * - student: own threads; write only on the active one.
 * - employee: their own active thread while assigned, or (cover) the student's
 *   active thread during an active COVER assignment.
 * - manager/admin: read-only (unless they are the thread's assigned employee).
 */
export async function threadAccess(user: Actor, threadId: string): Promise<ThreadAccess> {
  const thread = await db.messageThread.findUnique({ where: { id: threadId }, select: THREAD_SELECT });
  if (!thread) throw new MessagingError("Conversation not found.");
  if (user.role === "STUDENT") {
    if (thread.student.userId !== user.id) throw new MessagingError("Conversation not found.");
    return { thread, canWrite: thread.isActive, side: "student" };
  }
  const ep = await db.employeeProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (ep && thread.isActive && (await hasActiveAssignment(ep.id, thread.studentId))) {
    return { thread, canWrite: true, side: "staff" };
  }
  if (isManagerial(user.role)) return { thread, canWrite: false, side: "observer" };
  throw new MessagingError("This conversation isn't available to you.");
}

// ───────────────────────────── Thread lists ─────────────────────────────

async function lastMessages(threadIds: string[]) {
  if (!threadIds.length) return new Map<string, { body: string; createdAt: Date; senderId: string; hasAttachment: boolean }>();
  const rows = await db.$queryRaw<{ threadId: string; body: string; createdAt: Date; senderId: string; n: number }[]>`
    SELECT DISTINCT ON ("threadId") "threadId", body, "createdAt", "senderId", cardinality("attachmentKeys") AS n
    FROM "Message" WHERE "threadId" IN (${Prisma.join(threadIds)})
    ORDER BY "threadId", "createdAt" DESC`;
  return new Map(rows.map((r) => [r.threadId, { body: r.body, createdAt: r.createdAt, senderId: r.senderId, hasAttachment: Number(r.n) > 0 }]));
}

async function unreadByThread(threadIds: string[], notSenderIds: string[]) {
  if (!threadIds.length) return new Map<string, number>();
  const rows = await db.message.groupBy({ by: ["threadId"], where: { threadId: { in: threadIds }, readAt: null, senderId: { notIn: notSenderIds } }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.threadId, r._count._all]));
}

export type ThreadListItem = {
  id: string;
  studentId: string;
  title: string;
  subtitle: string | null;
  isActive: boolean;
  canWrite: boolean;
  unread: number;
  last: { preview: string; at: Date; mine: boolean; hasAttachment: boolean } | null;
};

function preview(body: string) {
  return body.replace(/\*\*|__|\*|_|\[|\]\([^)]*\)/g, "").replace(/\s+/g, " ").trim().slice(0, 140);
}

/** Threads for the staff inbox (/work/messages). */
export async function listStaffThreads(user: Actor, opts: { q?: string } = {}): Promise<ThreadListItem[]> {
  const ep = await db.employeeProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!ep) return [];
  const now = new Date();
  const covers = await db.assignment.findMany({ where: { employeeId: ep.id, type: "COVER", isActive: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, select: { studentId: true } });
  const threads = await db.messageThread.findMany({
    where: {
      isActive: true,
      OR: [{ employeeId: ep.id }, ...(covers.length ? [{ studentId: { in: covers.map((c) => c.studentId) } }] : [])],
      ...(opts.q ? { student: { user: { name: { contains: opts.q, mode: "insensitive" as const } } } } : {}),
    },
    select: THREAD_SELECT,
  });
  // Only threads the employee can actually access right now.
  const allowed: ThreadRow[] = [];
  for (const t of threads) if (await hasActiveAssignment(ep.id, t.studentId)) allowed.push(t);
  const ids = allowed.map((t) => t.id);
  const [last, unread] = await Promise.all([lastMessages(ids), unreadByThread(ids, [user.id, ...allowed.map((t) => t.employee.userId)])]);
  return allowed
    .map((t) => {
      const l = last.get(t.id);
      const cover = t.employeeId !== ep.id;
      return {
        id: t.id,
        studentId: t.studentId,
        title: t.student.user.name,
        subtitle: cover ? `cover:${t.employee.user.name}` : null,
        isActive: t.isActive,
        canWrite: true,
        unread: unread.get(t.id) ?? 0,
        last: l ? { preview: preview(l.body), at: l.createdAt, mine: l.senderId !== t.student.userId, hasAttachment: l.hasAttachment } : null,
      };
    })
    .sort((a, b) => (b.last?.at.getTime() ?? 0) - (a.last?.at.getTime() ?? 0));
}

/** Every thread (managers/admins, read-only quality control). */
export async function listAllThreadsForAdmin(user: Actor, opts: { q?: string; take?: number } = {}): Promise<ThreadListItem[]> {
  if (!isManagerial(user.role)) throw new MessagingError("Only managers and admins can view all conversations.");
  const q = opts.q?.trim();
  const threads = await db.messageThread.findMany({
    where: q ? { OR: [{ student: { user: { name: { contains: q, mode: "insensitive" } } } }, { employee: { user: { name: { contains: q, mode: "insensitive" } } } }] } : {},
    select: THREAD_SELECT,
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 100,
  });
  const ids = threads.map((t) => t.id);
  const last = await lastMessages(ids);
  return threads
    .map((t) => {
      const l = last.get(t.id);
      return {
        id: t.id,
        studentId: t.studentId,
        title: t.student.user.name,
        subtitle: t.employee.user.name,
        isActive: t.isActive,
        canWrite: false,
        unread: 0,
        last: l ? { preview: preview(l.body), at: l.createdAt, mine: false, hasAttachment: l.hasAttachment } : null,
      };
    })
    .sort((a, b) => (b.last?.at.getTime() ?? 0) - (a.last?.at.getTime() ?? 0));
}

/** The student's threads: the current one first, then previous (read-only) ones. */
export async function listStudentThreads(user: Actor): Promise<ThreadListItem[]> {
  if (user.role !== "STUDENT") throw new MessagingError("Only students have this inbox.");
  const threads = await db.messageThread.findMany({ where: { student: { userId: user.id } }, select: THREAD_SELECT, orderBy: { createdAt: "desc" } });
  const ids = threads.map((t) => t.id);
  const [last, unread] = await Promise.all([lastMessages(ids), unreadByThread(ids, [user.id])]);
  return threads
    .map((t) => {
      const l = last.get(t.id);
      return {
        id: t.id,
        studentId: t.studentId,
        title: firstName(t.employee.user.name),
        subtitle: null,
        isActive: t.isActive,
        canWrite: t.isActive,
        unread: unread.get(t.id) ?? 0,
        last: l ? { preview: preview(l.body), at: l.createdAt, mine: l.senderId === user.id, hasAttachment: l.hasAttachment } : null,
      };
    })
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || (b.last?.at.getTime() ?? 0) - (a.last?.at.getTime() ?? 0));
}

/** Total unread for the nav badge / Today tile. */
export async function unreadCount(user: Actor) {
  if (user.role === "STUDENT") return db.message.count({ where: { thread: { student: { userId: user.id } }, senderId: { not: user.id }, readAt: null } });
  const items = await listStaffThreads(user);
  return items.reduce((a, t) => a + t.unread, 0);
}

// ───────────────────────────── Thread view ─────────────────────────────

export type MessageView = {
  id: string;
  body: string;
  mine: boolean;
  fromStudent: boolean;
  senderName: string;
  createdAt: Date;
  readAt: Date | null;
  isBroadcast: boolean;
  attachments: { id: string; filename: string; mime: string; size: number }[];
  application: { id: string; companyName: string; jobTitle: string; status: string; companyDomain: string | null } | null;
};

export type ThreadView = {
  id: string;
  studentId: string;
  isActive: boolean;
  canWrite: boolean;
  side: ThreadAccess["side"];
  counterpart: string;
  studentName: string;
  employeeName: string;
  messages: MessageView[];
  hasMore: boolean;
};

const PAGE = 100;

async function loadMessages(viewer: Actor, t: ThreadRow, side: ThreadAccess["side"], opts: { before?: Date } = {}) {
  const rows = await db.message.findMany({
    where: { threadId: t.id, ...(opts.before ? { createdAt: { lt: opts.before } } : {}) },
    orderBy: { createdAt: "desc" },
    take: PAGE + 1,
    select: {
      id: true,
      body: true,
      senderId: true,
      createdAt: true,
      readAt: true,
      isBroadcast: true,
      attachmentKeys: true,
      sender: { select: { name: true, role: true } },
      application: { select: { id: true, companyName: true, jobTitle: true, status: true, companyDomain: true } },
    },
  });
  const hasMore = rows.length > PAGE;
  const page = rows.slice(0, PAGE).reverse();
  const keys = page.flatMap((m) => m.attachmentKeys);
  const files = keys.length ? await db.fileObject.findMany({ where: { key: { in: keys } }, select: { id: true, key: true, filename: true, mime: true, size: true } }) : [];
  const fileByKey = new Map(files.map((f) => [f.key, f]));
  const messages: MessageView[] = page.map((m) => {
    const fromStudent = m.senderId === t.student.userId;
    const name = side === "student" && !fromStudent ? firstName(m.sender.name) : m.sender.name;
    return {
      id: m.id,
      body: m.body,
      mine: m.senderId === viewer.id,
      fromStudent,
      senderName: name,
      createdAt: m.createdAt,
      readAt: m.readAt,
      isBroadcast: m.isBroadcast,
      attachments: m.attachmentKeys
        .map((k) => fileByKey.get(k))
        .filter((f): f is NonNullable<typeof f> => Boolean(f))
        .map((f) => ({ id: f.id, filename: f.filename ?? "attachment", mime: f.mime, size: f.size })),
      application: m.application,
    };
  });
  return { messages, hasMore };
}

/** Mark the other side's messages as read (read receipts). Observers never mark. */
export async function markRead(access: ThreadAccess, now = new Date()) {
  if (access.side === "observer") return 0;
  const studentUserId = access.thread.student.userId;
  const r = await db.message.updateMany({
    where: { threadId: access.thread.id, readAt: null, ...(access.side === "student" ? { senderId: { not: studentUserId } } : { senderId: studentUserId }) },
    data: { readAt: now },
  });
  return r.count;
}

function view(access: ThreadAccess, loaded: { messages: MessageView[]; hasMore: boolean }): ThreadView {
  const t = access.thread;
  return {
    id: t.id,
    studentId: t.studentId,
    isActive: t.isActive,
    canWrite: access.canWrite,
    side: access.side,
    counterpart: access.side === "student" ? firstName(t.employee.user.name) : t.student.user.name,
    studentName: t.student.user.name,
    employeeName: access.side === "student" ? firstName(t.employee.user.name) : t.employee.user.name,
    messages: loaded.messages,
    hasMore: loaded.hasMore,
  };
}

/** Open a thread as a participant (marks the other side's messages read). */
export async function getThread(user: Actor, threadId: string, opts: { markAsRead?: boolean; before?: Date } = {}): Promise<ThreadView> {
  const access = await threadAccess(user, threadId);
  if (opts.markAsRead !== false) await markRead(access);
  return view(access, await loadMessages(user, access.thread, access.side, { before: opts.before }));
}

/**
 * Read-only thread viewer for managers/admins (quality control, §3/F7).
 * Never marks messages read and never allows writing. Mount with
 * `<ThreadViewer thread={await getThreadForAdmin(user, id)} />` from
 * src/components/messaging/thread-viewer.tsx.
 */
export async function getThreadForAdmin(user: Actor, threadId: string): Promise<ThreadView> {
  if (!isManagerial(user.role)) throw new MessagingError("Only managers and admins can view conversations read-only.");
  const thread = await db.messageThread.findUnique({ where: { id: threadId }, select: THREAD_SELECT });
  if (!thread) throw new MessagingError("Conversation not found.");
  const access: ThreadAccess = { thread, canWrite: false, side: "observer" };
  await audit({ actorId: user.id, action: "message.thread_viewed", entity: "MessageThread", entityId: threadId });
  return view(access, await loadMessages(user, thread, "observer"));
}

/** Threads of one student, for admin 360° views (read-only). */
export async function listThreadsForStudentAdmin(user: Actor, studentId: string) {
  if (!isManagerial(user.role)) throw new MessagingError("Only managers and admins can view conversations.");
  return db.messageThread.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, select: { id: true, isActive: true, createdAt: true, employee: { select: { user: { select: { name: true } } } }, _count: { select: { messages: true } } } });
}

// ───────────────────────────── Send ─────────────────────────────

export const SendInput = z.object({
  threadId: z.string().min(1),
  body: z.string().max(MAX_BODY, `Messages can be up to ${MAX_BODY} characters.`).transform((s) => s.replace(/\r\n/g, "\n").trim()),
  applicationId: z.string().min(1).optional().nullable(),
});

export type Attachment = { buffer: Buffer; filename?: string };

export async function sendMessage(user: Actor, raw: z.input<typeof SendInput>, attachments: Attachment[] = [], now = new Date()) {
  const input = SendInput.parse(raw);
  if (!input.body && !attachments.length) throw new MessagingError("Write a message or attach a file.", "body");
  if (attachments.length > MAX_ATTACHMENTS) throw new MessagingError(`Attach up to ${MAX_ATTACHMENTS} files per message.`, "attachments");
  const access = await threadAccess(user, input.threadId);
  if (!access.canWrite) throw new MessagingError(access.side === "observer" ? "You can view this conversation but not reply." : "This conversation is closed. Message your current specialist instead.");
  await enforceRateLimit("message", user.id);
  if (input.applicationId) {
    const app = await db.jobApplication.findUnique({ where: { id: input.applicationId }, select: { studentId: true } });
    if (!app || app.studentId !== access.thread.studentId) throw new MessagingError("That application doesn't belong to this applicant.", "applicationId");
  }
  const stored: string[] = [];
  try {
    for (const a of attachments) {
      const f = await storeUpload({
        buffer: a.buffer,
        filename: a.filename,
        ownerUserId: user.id,
        studentId: access.thread.studentId,
        purpose: "message",
        allowed: [...ATTACHMENT_KINDS],
        maxBytes: LIMITS.attachment,
        keyPrefix: `students/${access.thread.studentId}/messages`,
      });
      stored.push(f.key);
    }
    const m = await db.message.create({
      data: { threadId: access.thread.id, senderId: user.id, body: input.body, attachmentKeys: stored, applicationId: input.applicationId ?? null, createdAt: now },
      select: { id: true, createdAt: true },
    });
    return m;
  } catch (e) {
    for (const k of stored) await deleteObject(k).catch(() => undefined);
    throw e;
  }
}

/** Employee broadcast (e.g. holiday notice): one individual message per assigned student's active thread. */
export async function broadcast(user: Actor, rawBody: string, now = new Date()) {
  const body = z.string().trim().min(1, "Write the message first.").max(MAX_BODY).parse(rawBody);
  const ep = await db.employeeProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!ep) throw new MessagingError("Only specialists with assigned applicants can broadcast.");
  await enforceRateLimit("message", `${user.id}:broadcast`, { tokens: 10 });
  const assigned = await db.assignment.findMany({ where: { employeeId: ep.id, isActive: true, type: "PRIMARY" }, select: { studentId: true } });
  const threads = await db.messageThread.findMany({ where: { employeeId: ep.id, isActive: true, studentId: { in: assigned.map((a) => a.studentId) } }, select: { id: true } });
  if (!threads.length) throw new MessagingError("You don't have any assigned applicants to message.");
  await db.message.createMany({ data: threads.map((t) => ({ threadId: t.id, senderId: user.id, body, attachmentKeys: [], isBroadcast: true, createdAt: now })) });
  await audit({ actorId: user.id, action: "message.broadcast", entity: "EmployeeProfile", entityId: ep.id, after: { recipients: threads.length } });
  return { count: threads.length };
}

/** Applications the composer can link (student's latest 30). */
export async function linkableApplications(user: Actor, threadId: string) {
  const access = await threadAccess(user, threadId);
  return db.jobApplication.findMany({ where: { studentId: access.thread.studentId, status: { not: "DRAFT" } }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, companyName: true, jobTitle: true, status: true } });
}

// ───────────────────────────── Unread email job ─────────────────────────────

/**
 * Every 5 minutes: messages unread for ≥ 10 minutes and not yet emailed are
 * claimed atomically (emailedAt) and one email per (thread, recipient) is
 * sent through notify("new_message"). Older than 2 days are skipped (they
 * predate the job; e.g. imported history).
 */
export async function runUnreadEmails(now = new Date()) {
  const cutoff = new Date(now.getTime() - UNREAD_EMAIL_AFTER_MIN * 60_000);
  const floor = new Date(now.getTime() - 2 * 86400e3);
  const pending = await db.message.findMany({
    where: { readAt: null, emailedAt: null, createdAt: { lte: cutoff, gte: floor } },
    orderBy: { createdAt: "asc" },
    take: 500,
    select: { id: true, threadId: true, body: true, senderId: true, attachmentKeys: true, thread: { select: THREAD_SELECT } },
  });
  const groups = new Map<string, typeof pending>();
  for (const m of pending) groups.set(m.threadId, [...(groups.get(m.threadId) ?? []), m]);
  let sent = 0;
  for (const [, msgs] of groups) {
    const t = msgs[0]!.thread;
    const ids = msgs.map((m) => m.id);
    const claimed = await db.message.updateMany({ where: { id: { in: ids }, emailedAt: null, readAt: null }, data: { emailedAt: now } });
    if (!claimed.count) continue;
    const latest = msgs[msgs.length - 1]!;
    const fromStudent = latest.senderId === t.student.userId;
    // The previous employee can no longer open an inactive thread, so don't email them.
    if (fromStudent && !t.isActive) continue;
    const recipient = fromStudent ? t.employee.userId : t.student.userId;
    const sender = await db.user.findUnique({ where: { id: latest.senderId }, select: { name: true } });
    const from = fromStudent ? t.student.user.name : firstName(sender?.name ?? t.employee.user.name);
    const text = preview(latest.body) || (latest.attachmentKeys.length ? "Sent an attachment" : "");
    const more = msgs.length > 1 ? ` (+${msgs.length - 1} more)` : "";
    await notify(recipient, "new_message", { from, preview: `${text}${more}`, link: fromStudent ? `/work/messages?thread=${t.id}` : "/app/messages" });
    sent++;
  }
  return { sent };
}
