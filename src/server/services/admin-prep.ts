import "server-only";
import { z } from "zod";
import { db, Prisma } from "@/server/db";
import { UserError } from "@/server/errors";
import { audit } from "./audit";
import { renderRichText } from "./cms";
import { LIMITS, storeUpload } from "./files";
import { notify } from "./notify";

/**
 * Interview prep (SPEC F12): resources + mock interview slots. ADMIN only.
 * Bodies use the CMS Tiptap schema and server-side sanitiser (D-036).
 * Uploaded PDFs are stored with purpose "public" so students can open them
 * through /api/files (DECISIONS D-050).
 */

export const PREP_TYPES = ["VIDEO", "ARTICLE", "PDF", "QUESTION_BANK", "LINK"] as const;

const tagList = z
  .array(z.string().trim().toLowerCase().min(1).max(40))
  .max(20)
  .transform((a) => [...new Set(a)]);

export const prepInputSchema = z
  .object({
    id: z.string().optional(),
    title: z.string().trim().min(3, "Enter a title.").max(160),
    type: z.enum(PREP_TYPES),
    tags: tagList,
    marketCodes: z.array(z.string().regex(/^[A-Z]{2}$/)).max(20),
    url: z
      .string()
      .trim()
      .max(1000)
      .refine((v) => !v || /^https:\/\//i.test(v), "Use an https:// link.")
      .optional()
      .nullable(),
    fileKey: z.string().max(300).optional().nullable(),
    body: z.unknown().optional().nullable(),
    isPublished: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if ((v.type === "VIDEO" || v.type === "LINK") && !v.url) ctx.addIssue({ code: "custom", path: ["url"], message: "Add the link." });
    if (v.type === "PDF" && !v.fileKey && !v.url) ctx.addIssue({ code: "custom", path: ["fileKey"], message: "Upload the PDF or add a link." });
  });
export type PrepInput = z.input<typeof prepInputSchema>;

const PREP_SELECT = { id: true, title: true, type: true, tags: true, marketCodes: true, url: true, fileKey: true, body: true, isPublished: true, createdAt: true } as const;

export async function listPrep() {
  const rows = await db.prepResource.findMany({ orderBy: { createdAt: "desc" }, select: PREP_SELECT });
  const files = await db.fileObject.findMany({ where: { key: { in: rows.map((r) => r.fileKey).filter((x): x is string => Boolean(x)) } }, select: { id: true, key: true, filename: true } });
  const fm = new Map(files.map((f) => [f.key, f]));
  return rows.map((r) => ({ ...r, file: r.fileKey ? (fm.get(r.fileKey) ?? null) : null }));
}

export async function savePrep(actorId: string, raw: PrepInput) {
  const input = prepInputSchema.parse(raw);
  const hasBody = input.body && typeof input.body === "object" && Array.isArray((input.body as { content?: unknown[] }).content) && ((input.body as { content: unknown[] }).content.length ?? 0) > 0;
  let body: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
  let bodyHtml: string | null = null;
  if (hasBody) {
    try {
      const r = renderRichText(input.body);
      body = r.doc as Prisma.InputJsonValue;
      bodyHtml = r.html;
    } catch (e) {
      throw new UserError(e instanceof Error ? e.message : "The content couldn't be read.", "body");
    }
  }
  if (input.fileKey) {
    const f = await db.fileObject.findUnique({ where: { key: input.fileKey }, select: { purpose: true } });
    if (!f || f.purpose !== "public") throw new UserError("Upload the file again.", "fileKey");
  }
  const data = { title: input.title, type: input.type, tags: input.tags, marketCodes: input.marketCodes, url: input.url || null, fileKey: input.fileKey || null, body, bodyHtml, isPublished: input.isPublished };
  if (input.id) {
    const before = await db.prepResource.findUnique({ where: { id: input.id }, select: { title: true, isPublished: true, type: true } });
    if (!before) throw new UserError("Resource not found.");
    await db.prepResource.update({ where: { id: input.id }, data });
    await audit({ actorId, action: "prep.update", entity: "PrepResource", entityId: input.id, before, after: { title: data.title, isPublished: data.isPublished, type: data.type } });
    return { id: input.id };
  }
  const created = await db.prepResource.create({ data, select: { id: true } });
  await audit({ actorId, action: "prep.create", entity: "PrepResource", entityId: created.id, after: { title: data.title, type: data.type } });
  return created;
}

export async function setPrepPublished(actorId: string, id: string, isPublished: boolean) {
  const r = await db.prepResource.updateMany({ where: { id }, data: { isPublished } });
  if (!r.count) throw new UserError("Resource not found.");
  await audit({ actorId, action: isPublished ? "prep.publish" : "prep.unpublish", entity: "PrepResource", entityId: id });
  return { ok: true };
}

export async function deletePrep(actorId: string, id: string) {
  const r = await db.prepResource.findUnique({ where: { id }, select: { title: true } });
  if (!r) throw new UserError("Resource not found.");
  await db.prepResource.delete({ where: { id } });
  await audit({ actorId, action: "prep.delete", entity: "PrepResource", entityId: id, before: r });
  return { ok: true };
}

/** PDF upload for a prep resource. Stored as purpose "public" (readable by students). */
export async function uploadPrepFile(actorId: string, file: { buffer: Buffer; filename?: string }) {
  const f = await storeUpload({ buffer: file.buffer, filename: file.filename, ownerUserId: actorId, purpose: "public", allowed: ["pdf"], maxBytes: LIMITS.attachment, keyPrefix: "prep" });
  return { id: f.id, key: f.key, filename: f.filename };
}

// ─────────────────────────── Mock interview slots ───────────────────────────

export const MOCK_STATUSES = ["OPEN", "SCHEDULED", "DONE", "NO_SHOW", "CANCELLED"] as const;

export const slotInputSchema = z.object({
  conductedById: z.string().min(1, "Pick who runs it."),
  scheduledAt: z.coerce.date({ error: "Pick a date and time." }).refine((d) => d.getTime() > Date.now() - 3600e3, "Pick a time in the future."),
  durationMin: z.coerce.number().int().min(15).max(180),
  focus: z.string().trim().min(2, "Describe the focus.").max(160),
  meetingLink: z
    .string()
    .trim()
    .max(1000)
    .refine((v) => !v || /^https:\/\//i.test(v), "Use an https:// link.")
    .optional()
    .nullable(),
  count: z.coerce.number().int().min(1).max(10).default(1), // consecutive slots
});

export async function createSlots(actorId: string, raw: z.input<typeof slotInputSchema>) {
  const input = slotInputSchema.parse(raw);
  const emp = await db.employeeProfile.findUnique({ where: { id: input.conductedById }, select: { user: { select: { status: true } } } });
  if (!emp || emp.user.status === "DEACTIVATED") throw new UserError("Pick an active employee or trainer.", "conductedById");
  const data = Array.from({ length: input.count }, (_, i) => ({
    conductedById: input.conductedById,
    scheduledAt: new Date(input.scheduledAt.getTime() + i * input.durationMin * 60000),
    durationMin: input.durationMin,
    status: "OPEN",
    focus: input.focus,
    meetingLink: input.meetingLink || null,
  }));
  await db.mockInterview.createMany({ data });
  await audit({ actorId, action: "mock.slots_created", entity: "MockInterview", after: { conductedById: input.conductedById, count: data.length, from: data[0]!.scheduledAt } });
  return { count: data.length };
}

export const scorecardSchema = z.object({
  id: z.string().min(1),
  outcome: z.enum(["DONE", "NO_SHOW", "CANCELLED"]),
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
});

export async function recordMockOutcome(actorId: string, raw: z.input<typeof scorecardSchema>) {
  const input = scorecardSchema.parse(raw);
  const m = await db.mockInterview.findUnique({ where: { id: input.id }, select: { status: true, studentId: true, focus: true, student: { select: { userId: true } } } });
  if (!m) throw new UserError("Slot not found.");
  if (input.outcome !== "CANCELLED" && !m.studentId) throw new UserError("Nobody booked this slot. Cancel it instead.");
  if (input.outcome === "DONE" && !input.scores) throw new UserError("Fill in the scorecard.", "scores");
  await db.mockInterview.update({
    where: { id: input.id },
    data: { status: input.outcome, scores: input.outcome === "DONE" ? (input.scores as Prisma.InputJsonValue) : Prisma.DbNull, feedback: input.feedback || null },
  });
  await audit({ actorId, action: `mock.${input.outcome.toLowerCase()}`, entity: "MockInterview", entityId: input.id, before: { status: m.status }, after: { status: input.outcome, scores: input.scores ?? null } });
  if (input.outcome === "DONE" && m.student) {
    await notify(m.student.userId, "generic", { title: "Your mock interview feedback is ready", body: `Scores and notes for "${m.focus ?? "your mock interview"}" are now on your Prep page.`, link: "/app/prep" });
  }
  return { ok: true };
}

export async function listSlots(now = new Date()) {
  const rows = await db.mockInterview.findMany({
    where: { scheduledAt: { gte: new Date(now.getTime() - 30 * 86400e3) } },
    orderBy: { scheduledAt: "asc" },
    take: 200,
    select: { id: true, scheduledAt: true, durationMin: true, status: true, focus: true, meetingLink: true, scores: true, feedback: true, conductedById: true, student: { select: { id: true, user: { select: { name: true } } } } },
  });
  const emps = await db.employeeProfile.findMany({ where: { user: { status: { not: "DEACTIVATED" }, deletedAt: null } }, orderBy: { user: { name: "asc" } }, select: { id: true, user: { select: { name: true } } } });
  const names = new Map(emps.map((e) => [e.id, e.user.name]));
  const missing = [...new Set(rows.map((r) => r.conductedById).filter((id) => !names.has(id)))];
  if (missing.length) {
    // conductedById is an EmployeeProfile id (older seed rows may hold a User id).
    for (const e of await db.employeeProfile.findMany({ where: { OR: [{ id: { in: missing } }, { userId: { in: missing } }] }, select: { id: true, userId: true, user: { select: { name: true } } } })) {
      names.set(e.id, e.user.name);
      names.set(e.userId, e.user.name);
    }
  }
  return { slots: rows.map((r) => ({ ...r, conductedBy: names.get(r.conductedById) ?? "—" })), staff: emps.map((e) => ({ id: e.id, name: e.user.name })) };
}

export async function deleteSlot(actorId: string, id: string) {
  const m = await db.mockInterview.findUnique({ where: { id }, select: { status: true, studentId: true } });
  if (!m) throw new UserError("Slot not found.");
  if (m.studentId) throw new UserError("This slot is booked. Mark it cancelled instead.");
  await db.mockInterview.delete({ where: { id } });
  await audit({ actorId, action: "mock.slot_deleted", entity: "MockInterview", entityId: id });
  return { ok: true };
}
