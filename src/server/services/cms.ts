import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";
import { generateHTML } from "@tiptap/html/server";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { audit } from "./audit";
import { storeUpload, LIMITS as FILE_LIMITS } from "./files";

/**
 * CMS (SPEC §6.4, §11): pages, legal, blog, success stories, FAQ, team and
 * landing pages. Bodies are edited with Tiptap and stored as JSON + HTML.
 *
 * Security: the HTML is ALWAYS generated on the server from the Tiptap JSON
 * after the JSON has been passed through an allow-list of nodes, marks and
 * attributes. Client-supplied HTML is never stored or rendered.
 */

export const CMS_KINDS = ["PAGE", "LEGAL", "BLOG", "STORY", "FAQ", "TEAM", "LANDING"] as const;
export type CmsKind = (typeof CMS_KINDS)[number];

export const MAX_REVISIONS = 20;
export const CMS_TAG = "cms";

export class CmsError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = "CmsError";
  }
}

// ───────────────────────────── Slugs ─────────────────────────────

/** Lowercase letters, digits and single hyphens; 1–80 chars; no leading/trailing hyphen. */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const slugSchema = z
  .string()
  .trim()
  .min(1, "Enter a slug")
  .max(80, "Use at most 80 characters")
  .regex(SLUG_RE, "Use lowercase letters, numbers and single hyphens (e.g. my-first-post)");

export function toSlug(input: string) {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** Legal pages are fixed (privacy, terms, refund, guarantee, cookies) — the signup and footer link to them. */
export const LEGAL_SLUGS = ["privacy", "terms", "refund", "guarantee", "cookies"] as const;

// ───────────────────────────── Rich text allow-list ─────────────────────────────

type PMMark = { type: string; attrs?: Record<string, unknown> };
export type PMNode = { type: string; attrs?: Record<string, unknown>; content?: PMNode[]; marks?: PMMark[]; text?: string };

const ALLOWED_NODES = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "hardBreak",
  "horizontalRule",
  "codeBlock",
  "image",
]);
const ALLOWED_MARKS = new Set(["bold", "italic", "underline", "strike", "code", "link"]);
/** Wrapper nodes whose children are kept when the node itself is not allowed. */
const UNWRAP_NODES = new Set(["table", "tableRow", "tableCell", "tableHeader", "taskList", "taskItem", "details", "detailsContent"]);

const MAX_DEPTH = 24;
const MAX_TEXT = 200_000;

/** Same-site paths or http(s)/mailto/tel only. Rejects javascript:, data:, protocol-relative, etc. */
export function safeHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v || v.length > 2000) return null;
  if (/[\u0000-\u001f\u007f]/.test(v)) return null;
  if (v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\")) return v;
  if (v.startsWith("#")) return v;
  try {
    const u = new URL(v);
    if (u.protocol === "https:" || u.protocol === "http:") return u.toString();
    if (u.protocol === "mailto:" || u.protocol === "tel:") return v;
  } catch {
    return null;
  }
  return null;
}

/** Images must be CMS uploads served by /media/<id> (CSP img-src is 'self'; no hotlinking or data: URIs). */
export function safeImageSrc(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return /^\/media\/[a-z0-9]{10,40}$/i.test(v) ? v : null;
}

function cleanText(v: unknown, max = 500) {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "";
}

function cleanMarks(marks: PMMark[] | undefined): PMMark[] | undefined {
  if (!Array.isArray(marks)) return undefined;
  const out: PMMark[] = [];
  for (const m of marks) {
    if (!m || typeof m.type !== "string" || !ALLOWED_MARKS.has(m.type)) continue;
    if (m.type === "link") {
      const href = safeHref(m.attrs?.href);
      if (!href) continue; // drop the link, keep the text
      const external = /^https?:/i.test(href);
      out.push({ type: "link", attrs: { href, target: external ? "_blank" : null, rel: external ? "noopener noreferrer" : null } });
      continue;
    }
    out.push({ type: m.type });
  }
  return out.length ? out : undefined;
}

export type SanitizeIssue = { code: "image_alt_missing" | "image_src_invalid" | "too_deep"; message: string };

/**
 * Walk Tiptap JSON and keep only allow-listed nodes/marks/attributes.
 * Images without alt text are collected as issues (callers decide to reject).
 */
export function sanitizeDoc(input: unknown, issues: SanitizeIssue[] = []): PMNode {
  let textBudget = MAX_TEXT;

  function walk(node: PMNode, depth: number): PMNode[] {
    if (!node || typeof node !== "object" || typeof node.type !== "string") return [];
    if (depth > MAX_DEPTH) {
      issues.push({ code: "too_deep", message: "The content is nested too deeply." });
      return [];
    }
    const children = () => (Array.isArray(node.content) ? node.content.flatMap((c) => walk(c, depth + 1)) : []);

    if (!ALLOWED_NODES.has(node.type)) {
      return UNWRAP_NODES.has(node.type) ? children() : [];
    }
    switch (node.type) {
      case "text": {
        const text = typeof node.text === "string" ? node.text.slice(0, Math.max(0, textBudget)) : "";
        textBudget -= text.length;
        if (!text) return [];
        const marks = cleanMarks(node.marks);
        return [marks ? { type: "text", text, marks } : { type: "text", text }];
      }
      case "heading": {
        const raw = Number(node.attrs?.level);
        const level = raw >= 2 && raw <= 4 ? raw : raw <= 1 ? 2 : 4; // H1 is reserved for the page title
        return [{ type: "heading", attrs: { level }, content: children() }];
      }
      case "orderedList": {
        const start = Number(node.attrs?.start);
        return [{ type: "orderedList", attrs: { start: Number.isInteger(start) && start > 0 && start < 10000 ? start : 1 }, content: children() }];
      }
      case "codeBlock":
        return [{ type: "codeBlock", attrs: { language: null }, content: children().filter((c) => c.type === "text").map((c) => ({ type: "text", text: c.text })) }];
      case "image": {
        const src = safeImageSrc(node.attrs?.src);
        const alt = cleanText(node.attrs?.alt, 300);
        if (!src) {
          issues.push({ code: "image_src_invalid", message: "An image has an invalid source." });
          return [];
        }
        if (!alt) issues.push({ code: "image_alt_missing", message: "Every image needs alt text." });
        const w = Number(node.attrs?.width);
        const h = Number(node.attrs?.height);
        return [
          {
            type: "image",
            attrs: {
              src,
              alt,
              title: cleanText(node.attrs?.title, 200) || null,
              width: Number.isInteger(w) && w > 0 && w < 10000 ? w : null,
              height: Number.isInteger(h) && h > 0 && h < 10000 ? h : null,
            },
          },
        ];
      }
      case "hardBreak":
      case "horizontalRule":
        return [{ type: node.type }];
      case "doc":
      case "paragraph":
      case "bulletList":
      case "listItem":
      case "blockquote": {
        const c = children();
        return [c.length ? { type: node.type, content: c } : { type: node.type }];
      }
      default:
        return [];
    }
  }

  const root = (input && typeof input === "object" ? input : { type: "doc", content: [] }) as PMNode;
  const content = root.type === "doc" ? (Array.isArray(root.content) ? root.content : []).flatMap((c) => walk(c, 1)) : walk(root, 1);
  // Lists need list items, list items need a block — drop inline debris at block level.
  const blocks = content.filter((n) => n.type !== "text" && n.type !== "hardBreak");
  return { type: "doc", content: blocks.length ? fixStructure(blocks) : [{ type: "paragraph" }] };
}

/** Repair structure the schema would reject (e.g. text directly inside a list). */
function fixStructure(nodes: PMNode[]): PMNode[] {
  return nodes.map((n) => {
    if (n.type === "bulletList" || n.type === "orderedList") {
      const items = (n.content ?? []).filter((c) => c.type === "listItem").map((li) => ({ ...li, content: fixListItem(li.content ?? []) }));
      return { ...n, content: items.length ? items : [{ type: "listItem", content: [{ type: "paragraph" }] }] };
    }
    if (n.type === "blockquote") {
      const c = fixStructure((n.content ?? []).filter((x) => x.type !== "text" && x.type !== "hardBreak"));
      return { ...n, content: c.length ? c : [{ type: "paragraph" }] };
    }
    if (n.type === "paragraph" || n.type === "heading") {
      const c = (n.content ?? []).filter((x) => x.type === "text" || x.type === "hardBreak");
      return c.length ? { ...n, content: c } : { type: n.type, ...(n.attrs ? { attrs: n.attrs } : {}) };
    }
    return n;
  });
}

function fixListItem(content: PMNode[]): PMNode[] {
  const out: PMNode[] = [];
  for (const c of content) {
    if (c.type === "text" || c.type === "hardBreak") {
      const last = out[out.length - 1];
      if (last?.type === "paragraph") last.content = [...(last.content ?? []), c];
      else out.push({ type: "paragraph", content: [c] });
    } else out.push(c);
  }
  const fixed = fixStructure(out);
  return fixed[0]?.type === "paragraph" ? fixed : [{ type: "paragraph" }, ...fixed];
}

/** Tiptap extensions used to (re)build HTML. Must match the editor's schema. */
export function cmsExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      link: { openOnClick: false, autolink: true, HTMLAttributes: { target: null, rel: null, class: null } },
      codeBlock: { HTMLAttributes: { class: null } },
      dropcursor: false,
      undoRedo: false,
      trailingNode: false,
    }),
    Image.configure({ inline: false, allowBase64: false }),
  ];
}

/** Sanitise + render. Throws CmsError when an image lacks alt text. */
export function renderRichText(input: unknown, opts: { requireAlt?: boolean } = {}) {
  const issues: SanitizeIssue[] = [];
  const doc = sanitizeDoc(input, issues);
  if (opts.requireAlt !== false && issues.some((i) => i.code === "image_alt_missing")) {
    throw new CmsError("Every image needs alt text. Select the image and add a description.", "body");
  }
  let html: string;
  try {
    html = generateHTML(doc as Parameters<typeof generateHTML>[0], cmsExtensions());
  } catch {
    throw new CmsError("The content couldn't be read. Please re-check the formatting.", "body");
  }
  // Lazy-load body images and make sure nothing executable slipped through (defence in depth).
  const out = html.replace(/<img /g, '<img loading="lazy" decoding="async" ');
  if (/<(script|iframe|object|embed|style|form|svg)\b|<[^>]*\son[a-z]+\s*=|(href|src)\s*=\s*"\s*(javascript|data|vbscript):/i.test(out)) {
    throw new CmsError("The content contains something that isn't allowed.", "body");
  }
  return { doc, html: out, issues };
}

/** Plain text from a Tiptap doc (for excerpts, reading time, FAQ answers in JSON-LD). */
export function docText(node: unknown): string {
  const n = node as PMNode;
  if (!n || typeof n !== "object") return "";
  if (n.type === "text") return n.text ?? "";
  const inner = (n.content ?? []).map(docText);
  const blockish = ["paragraph", "heading", "listItem", "blockquote", "codeBlock"].includes(n.type);
  return inner.join(n.type === "doc" || n.type.endsWith("List") ? "\n" : "") + (blockish ? "\n" : "");
}

export function readingMinutes(text: string) {
  return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 220));
}

// ───────────────────────────── Structured data ─────────────────────────────

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => v || undefined)
  .refine((v) => !v || /^https:\/\//i.test(v), "Use a full https:// link");
const optionalInt = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v) => (v === "" || v === undefined || v === null ? undefined : Number(v)))
  .refine((v) => v === undefined || (Number.isInteger(v) && v >= 0 && v < 100000), "Enter a whole number");
const fileId = z.string().trim().max(40).optional().transform((v) => v || undefined);

/** Video embeds we allow (CSP frame-src): YouTube (no-cookie) and Vimeo. */
export function videoEmbedUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    let id: string | null = null;
    if (host === "youtube.com" || host === "m.youtube.com") id = u.pathname.startsWith("/embed/") ? u.pathname.split("/")[2] ?? null : u.searchParams.get("v");
    else if (host === "youtu.be") id = u.pathname.slice(1);
    else if (host === "youtube-nocookie.com") id = u.pathname.split("/")[2] ?? null;
    if (id && /^[\w-]{6,20}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const vid = u.pathname.split("/").filter(Boolean).pop();
      if (vid && /^\d{4,15}$/.test(vid)) return `https://player.vimeo.com/video/${vid}`;
    }
  } catch {
    return null;
  }
  return null;
}

export const storyDataSchema = z.object({
  studentName: z.string().trim().min(1, "Enter the student's name").max(80),
  role: z.string().trim().min(1, "Enter the role").max(100),
  company: z.string().trim().min(1, "Enter the company").max(100),
  companyDomain: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v ? v.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase() : undefined))
    .refine((v) => !v || /^[a-z0-9.-]+\.[a-z]{2,}$/.test(v), "Enter a domain like example.com"),
  weeksToOffer: optionalInt,
  applicationsSent: optionalInt,
  quote: z.string().trim().min(1, "Enter the student's quote").max(400),
  photoId: fileId,
  photoAlt: z.string().trim().max(200).optional(),
  videoUrl: optionalUrl.refine((v) => !v || videoEmbedUrl(v) !== null, "Use a YouTube or Vimeo link"),
  consentConfirmed: z.boolean().optional(),
});
export type StoryData = z.infer<typeof storyDataSchema>;

export const teamDataSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80),
  role: z.string().trim().min(1, "Enter a role").max(100),
  photoId: fileId,
  photoAlt: z.string().trim().max(200).optional(),
  linkedin: optionalUrl.refine((v) => !v || /linkedin\.com\//i.test(v), "Use a linkedin.com link"),
});
export type TeamData = z.infer<typeof teamDataSchema>;

// ───────────────────────────── Revisions ─────────────────────────────

export type Revision = {
  at: string;
  by: string | null;
  title: string;
  slug: string;
  excerpt: string | null;
  body: unknown;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageKey: string | null;
  canonicalUrl: string | null;
  noindex: boolean;
  sortOrder: number;
  fields: Record<string, unknown> | null;
};

/** Newest first, capped at MAX_REVISIONS (SPEC §11). */
export function pushRevision(list: unknown, rev: Revision, max = MAX_REVISIONS): Revision[] {
  const prev = Array.isArray(list) ? (list as Revision[]) : [];
  return [rev, ...prev].slice(0, max);
}

export function splitData(data: unknown): { fields: Record<string, unknown> | null; revisions: Revision[] } {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { fields: null, revisions: [] };
  const { revisions, ...fields } = data as Record<string, unknown> & { revisions?: Revision[] };
  return { fields: Object.keys(fields).length ? fields : null, revisions: Array.isArray(revisions) ? revisions : [] };
}

// ───────────────────────────── Admin: input + CRUD ─────────────────────────────

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters`)
    .optional()
    .transform((v) => v || null);

export const entryInputSchema = z.object({
  id: z.string().optional(),
  kind: z.enum(CMS_KINDS),
  title: z.string().trim().min(2, "Enter a title").max(200, "Use at most 200 characters"),
  slug: slugSchema,
  excerpt: optionalText(500),
  body: z.unknown(),
  seoTitle: optionalText(60),
  seoDescription: optionalText(155),
  ogImageKey: optionalText(40),
  canonicalUrl: optionalText(500).refine((v) => !v || /^https:\/\//i.test(v) || v.startsWith("/"), "Use a full https:// URL or a path starting with /"),
  noindex: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(-9999).max(9999).default(0),
  fields: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type EntryInput = z.input<typeof entryInputSchema>;

function validateFields(kind: CmsKind, fields: Record<string, unknown> | null | undefined) {
  if (kind === "STORY") {
    const r = storyDataSchema.safeParse(fields ?? {});
    if (!r.success) {
      const i = r.error.issues[0]!;
      throw new CmsError(i.message, `fields.${String(i.path[0] ?? "")}`);
    }
    return r.data as Record<string, unknown>;
  }
  if (kind === "TEAM") {
    const r = teamDataSchema.safeParse(fields ?? {});
    if (!r.success) {
      const i = r.error.issues[0]!;
      throw new CmsError(i.message, `fields.${String(i.path[0] ?? "")}`);
    }
    return r.data as Record<string, unknown>;
  }
  return null;
}

const ENTRY_SELECT = {
  id: true,
  kind: true,
  slug: true,
  title: true,
  excerpt: true,
  body: true,
  bodyHtml: true,
  seoTitle: true,
  seoDescription: true,
  ogImageKey: true,
  canonicalUrl: true,
  noindex: true,
  sortOrder: true,
  data: true,
  isPublished: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listEntries(kind: CmsKind) {
  return db.cmsEntry.findMany({
    where: { kind, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    select: { id: true, kind: true, slug: true, title: true, isPublished: true, publishedAt: true, updatedAt: true, sortOrder: true, noindex: true },
  });
}

export async function countByKind() {
  const rows = await db.cmsEntry.groupBy({ by: ["kind"], where: { deletedAt: null }, _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.kind, r._count._all])) as Partial<Record<CmsKind, number>>;
}

export async function getEntry(id: string) {
  return db.cmsEntry.findFirst({ where: { id, deletedAt: null }, select: ENTRY_SELECT });
}

function snapshot(e: NonNullable<Awaited<ReturnType<typeof getEntry>>>, by: string | null): Revision {
  return {
    at: new Date().toISOString(),
    by,
    title: e.title,
    slug: e.slug,
    excerpt: e.excerpt,
    body: e.body,
    seoTitle: e.seoTitle,
    seoDescription: e.seoDescription,
    ogImageKey: e.ogImageKey,
    canonicalUrl: e.canonicalUrl,
    noindex: e.noindex,
    sortOrder: e.sortOrder,
    fields: splitData(e.data).fields,
  };
}

/** Create or update an entry. Previous content is pushed to data.revisions (max 20). */
export async function saveEntry(actor: { id: string; name?: string }, raw: EntryInput) {
  const input = entryInputSchema.parse(raw);
  if (input.kind === "LEGAL" && !(LEGAL_SLUGS as readonly string[]).includes(input.slug)) {
    throw new CmsError(`Legal pages use one of these slugs: ${LEGAL_SLUGS.join(", ")}.`, "slug");
  }
  const { doc, html } = renderRichText(input.body);
  const fields = validateFields(input.kind, input.fields);

  const clash = await db.cmsEntry.findFirst({
    where: { kind: input.kind, slug: input.slug, ...(input.id ? { NOT: { id: input.id } } : {}) },
    select: { id: true, deletedAt: true },
  });
  if (clash && !clash.deletedAt) throw new CmsError("Another entry of this kind already uses this slug.", "slug");
  if (clash?.deletedAt) {
    // Free the slug held by a soft-deleted entry.
    await db.cmsEntry.update({ where: { id: clash.id }, data: { slug: `${input.slug}-deleted-${clash.id.slice(-6)}`.slice(0, 120) } });
  }

  const common = {
    title: input.title,
    slug: input.slug,
    excerpt: input.excerpt,
    body: doc as Prisma.InputJsonValue,
    bodyHtml: html,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
    ogImageKey: input.ogImageKey,
    canonicalUrl: input.canonicalUrl,
    noindex: input.noindex,
    sortOrder: input.sortOrder,
  };

  let saved: { id: string; kind: string; slug: string; isPublished: boolean };
  if (input.id) {
    const before = await getEntry(input.id);
    if (!before) throw new CmsError("This entry no longer exists.");
    if (before.kind !== input.kind) throw new CmsError("The kind of an entry can't be changed.");
    const { revisions } = splitData(before.data);
    const data = { ...(fields ?? {}), revisions: pushRevision(revisions, snapshot(before, actor.name ?? actor.id)) };
    saved = await db.cmsEntry.update({
      where: { id: input.id },
      data: { ...common, data: data as Prisma.InputJsonValue },
      select: { id: true, kind: true, slug: true, isPublished: true },
    });
    await revalidateCms(before.kind as CmsKind, before.slug);
  } else {
    saved = await db.cmsEntry.create({
      data: { ...common, kind: input.kind, data: { ...(fields ?? {}), revisions: [] } as Prisma.InputJsonValue },
      select: { id: true, kind: true, slug: true, isPublished: true },
    });
  }
  await revalidateCms(saved.kind as CmsKind, saved.slug);
  return saved;
}

export async function setPublished(actor: { id: string }, id: string, publish: boolean) {
  const e = await db.cmsEntry.findFirst({ where: { id, deletedAt: null }, select: { id: true, kind: true, slug: true, bodyHtml: true, title: true, publishedAt: true, data: true } });
  if (!e) throw new CmsError("This entry no longer exists.");
  if (publish && e.kind === "STORY") {
    const parsed = storyDataSchema.safeParse(splitData(e.data).fields ?? {});
    if (!parsed.success || /\[[^\]]+\]/.test(`${e.title} ${parsed.data.studentName} ${parsed.data.quote}`)) {
      throw new CmsError("Fill in the story details (no [placeholders]) before publishing.");
    }
  }
  if (publish && /\[(DRAFT|placeholder)/i.test(e.bodyHtml)) {
    throw new CmsError("Replace the [DRAFT] placeholder text before publishing.");
  }
  await db.cmsEntry.update({
    where: { id },
    data: { isPublished: publish, publishedAt: publish ? (e.publishedAt ?? new Date()) : e.publishedAt },
  });
  await audit({ actorId: actor.id, action: publish ? "cms.publish" : "cms.unpublish", entity: "CmsEntry", entityId: id, after: { kind: e.kind, slug: e.slug } });
  await revalidateCms(e.kind as CmsKind, e.slug);
}

export async function softDelete(actor: { id: string }, id: string) {
  const e = await db.cmsEntry.findFirst({ where: { id, deletedAt: null }, select: { kind: true, slug: true } });
  if (!e) throw new CmsError("This entry no longer exists.");
  await db.cmsEntry.update({ where: { id }, data: { deletedAt: new Date(), isPublished: false } });
  await audit({ actorId: actor.id, action: "cms.delete", entity: "CmsEntry", entityId: id, after: e });
  await revalidateCms(e.kind as CmsKind, e.slug);
}

/** Restore a revision as a new save (the current version is kept in history). */
export async function restoreRevision(actor: { id: string; name?: string }, id: string, index: number) {
  const e = await getEntry(id);
  if (!e) throw new CmsError("This entry no longer exists.");
  const rev = splitData(e.data).revisions[index];
  if (!rev) throw new CmsError("That version is no longer available.");
  return saveEntry(actor, {
    id,
    kind: e.kind as CmsKind,
    title: rev.title,
    slug: rev.slug,
    excerpt: rev.excerpt ?? undefined,
    body: rev.body,
    seoTitle: rev.seoTitle ?? undefined,
    seoDescription: rev.seoDescription ?? undefined,
    ogImageKey: rev.ogImageKey ?? undefined,
    canonicalUrl: rev.canonicalUrl ?? undefined,
    noindex: rev.noindex,
    sortOrder: rev.sortOrder,
    fields: e.kind === "STORY" || e.kind === "TEAM" ? (rev.fields ?? {}) : null,
  });
}

/**
 * On-demand revalidation (SPEC §6.1). The marketing site is small, so a save
 * revalidates every marketing page (homepage FAQ/stories, sitemap, …) plus the
 * `cms` data tag. Safe to call outside a request (tests): errors are ignored.
 */
export async function revalidateCms(kind?: CmsKind, slug?: string) {
  try {
    revalidateTag(CMS_TAG);
    revalidatePath("/", "layout");
    revalidatePath("/sitemap.xml");
    if (kind && slug) {
      const path = publicPath(kind, slug);
      if (path) revalidatePath(path);
    }
  } catch {
    // Not inside a Next.js request (unit tests, scripts).
  }
}

/** Public URL of an entry, or null for kinds without their own page. */
export function publicPath(kind: CmsKind | string, slug: string) {
  switch (kind) {
    case "LEGAL":
      return `/legal/${slug}`;
    case "BLOG":
      return `/blog/${slug}`;
    case "STORY":
      return `/success-stories/${slug}`;
    case "LANDING":
      return `/for/${slug}`;
    case "PAGE":
      return slug === "about" ? "/about" : null;
    default:
      return null;
  }
}

// ───────────────────────────── Images ─────────────────────────────

/** Width/height of a PNG or JPEG (to reserve space and avoid layout shift). */
export function imageSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1]!;
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/** Store a CMS image (public, served by /media/<id>). Alt text is mandatory. */
export async function uploadImage(actor: { id: string }, file: { buffer: Buffer; filename?: string }, alt: string) {
  const cleanAlt = cleanText(alt, 300);
  if (!cleanAlt) throw new CmsError("Add alt text that describes the image.", "alt");
  const f = await storeUpload({
    buffer: file.buffer,
    filename: file.filename,
    ownerUserId: actor.id,
    purpose: "cms",
    allowed: ["png", "jpg"],
    maxBytes: FILE_LIMITS.image,
    keyPrefix: "cms",
  });
  const size = imageSize(file.buffer);
  return { id: f.id, src: mediaUrl(f.id), alt: cleanAlt, width: size?.width ?? null, height: size?.height ?? null };
}

export function mediaUrl(fileId: string) {
  return `/media/${fileId}`;
}

// ───────────────────────────── Public reads ─────────────────────────────

const PUBLIC_SELECT = {
  id: true,
  kind: true,
  slug: true,
  title: true,
  excerpt: true,
  bodyHtml: true,
  seoTitle: true,
  seoDescription: true,
  ogImageKey: true,
  canonicalUrl: true,
  noindex: true,
  sortOrder: true,
  data: true,
  publishedAt: true,
  updatedAt: true,
} as const;

export type PublicEntry = {
  id: string;
  kind: string;
  slug: string;
  title: string;
  excerpt: string | null;
  bodyHtml: string;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageKey: string | null;
  canonicalUrl: string | null;
  noindex: boolean;
  sortOrder: number;
  fields: Record<string, unknown> | null;
  publishedAt: Date | null;
  updatedAt: Date;
};

function toPublic(e: Prisma.CmsEntryGetPayload<{ select: typeof PUBLIC_SELECT }>): PublicEntry {
  const { data, ...rest } = e;
  return { ...rest, fields: splitData(data).fields };
}

export async function getPublished(kind: CmsKind, slug: string): Promise<PublicEntry | null> {
  const e = await db.cmsEntry.findFirst({ where: { kind, slug, isPublished: true, deletedAt: null }, select: PUBLIC_SELECT });
  return e ? toPublic(e) : null;
}

export async function listPublished(kind: CmsKind, opts: { take?: number; order?: "sort" | "recent" } = {}): Promise<PublicEntry[]> {
  const rows = await db.cmsEntry.findMany({
    where: { kind, isPublished: true, deletedAt: null },
    orderBy: opts.order === "recent" ? [{ publishedAt: "desc" }, { createdAt: "desc" }] : [{ sortOrder: "asc" }, { publishedAt: "desc" }],
    take: opts.take,
    select: PUBLIC_SELECT,
  });
  return rows.map(toPublic);
}

/** Everything that belongs in the sitemap (published, indexable, with a page). */
export async function sitemapEntries() {
  const rows = await db.cmsEntry.findMany({
    where: { isPublished: true, deletedAt: null, noindex: false, kind: { in: ["LEGAL", "BLOG", "STORY", "LANDING", "PAGE"] } },
    select: { kind: true, slug: true, updatedAt: true },
  });
  return rows.flatMap((r) => {
    const path = publicPath(r.kind, r.slug);
    return path ? [{ path, updatedAt: r.updatedAt, kind: r.kind }] : [];
  });
}

/**
 * Verified counters for the homepage proof strip (SPEC §6.2). Only numbers the
 * platform actually computed: students who had at least one application sent,
 * applications sent (not drafts), and applications that reached an interview.
 */
export async function computePublicStats() {
  const [students, applications, interviews] = await Promise.all([
    db.jobApplication.findMany({ where: { status: { not: "DRAFT" } }, distinct: ["studentId"], select: { studentId: true } }).then((r) => r.length),
    db.jobApplication.count({ where: { status: { not: "DRAFT" } } }),
    db.jobApplication.count({
      where: {
        OR: [
          { status: { in: ["INTERVIEW_SCHEDULED", "INTERVIEWING", "OFFER", "HIRED"] } },
          { interviews: { some: {} } },
          { events: { some: { toStatus: { in: ["INTERVIEW_SCHEDULED", "INTERVIEWING"] } } } },
        ],
      },
    }),
  ]);
  return { students, applications, interviews, computedAt: new Date().toISOString() };
}
