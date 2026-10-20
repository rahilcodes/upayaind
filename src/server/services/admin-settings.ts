import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { UserError } from "@/server/errors";
import { SECTION_KEYS } from "@/resume/schema";
import { audit } from "./audit";
import { getSettings, setSetting, type Settings } from "./settings";
import { TEMPLATES, type NotificationType } from "./notify";
import { alertWebhooksSchema, type AlertWebhook } from "./alerts";

/** Admin settings, resume styles/templates (SPEC §11 Settings, §9.3). ADMIN only (enforced by callers). */

// ─────────────────────────── Settings ───────────────────────────

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm (24-hour), e.g. 15:00.");

export const generalSettingsSchema = z.object({
  autoAssignEnabled: z.boolean(),
  defaultMaxStudents: z.coerce.number().int("Whole numbers only.").min(1, "At least 1.").max(100, "At most 100."),
  noResponseDays: z.coerce.number().int("Whole numbers only.").min(7, "At least 7 days.").max(180, "At most 180 days."),
  belowTargetAlertTime: hhmm,
  aiLimits: z.object({
    employeePerHour: z.coerce.number().int().min(1, "At least 1.").max(1000, "At most 1,000."),
    studentPerDay: z.coerce.number().int().min(1, "At least 1.").max(5000, "At most 5,000."),
  }),
});
export type GeneralSettings = z.infer<typeof generalSettingsSchema>;

/** Public site contact details + proof-strip figures (D-142). Stats are short display strings like "60+". */
export const publicSiteSchema = z.object({
  contactEmail: z.string().trim().email("Enter a valid email.").max(120),
  address: z.string().trim().max(200),
  stats: z.object({
    placed: z.string().trim().max(12),
    interviews: z.string().trim().max(12),
    applications: z.string().trim().max(12),
  }),
});
export type PublicSiteSettings = z.infer<typeof publicSiteSchema>;

export async function savePublicSiteSettings(actorId: string, input: z.input<typeof publicSiteSchema>) {
  const value = publicSiteSchema.parse(input);
  await setSetting("publicSite", value);
  await audit({ actorId, action: "settings.update", entity: "Setting", entityId: "publicSite", after: value });
  // Marketing pages are static (D-034): rebuild them so the new details show without waiting for ISR.
  revalidatePath("/", "layout");
  return value;
}

export const businessEntrySchema = z.object({
  legalName: z.string().trim().max(200),
  address: z.string().trim().max(1000),
  taxId: z.string().trim().max(120),
});
export const businessSchema = z.record(z.string().regex(/^[A-Z]{2}$/), businessEntrySchema);

export const templateOverrideSchema = z.object({
  subject: z.string().trim().max(200).optional(),
  heading: z.string().trim().max(200).optional(),
  body: z.string().trim().max(4000).optional(),
});

export const TEMPLATE_TYPES = Object.keys(TEMPLATES) as NotificationType[];

async function writeAll(actorId: string, patch: Partial<Settings>, action: string) {
  const before = await getSettings();
  const changed = (Object.keys(patch) as (keyof Settings)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(patch[k]));
  if (!changed.length) return { changed: 0 };
  for (const k of changed) await setSetting(k, patch[k] as never);
  await audit({ actorId, action, entity: "Setting", entityId: changed.join(","), before: Object.fromEntries(changed.map((k) => [k, before[k]])), after: Object.fromEntries(changed.map((k) => [k, patch[k]])) });
  return { changed: changed.length };
}

export async function saveGeneralSettings(actorId: string, raw: z.input<typeof generalSettingsSchema>) {
  const input = generalSettingsSchema.parse(raw);
  return writeAll(actorId, input, "settings.update");
}

export async function saveBusinessInfo(actorId: string, marketCode: string, raw: z.input<typeof businessEntrySchema>) {
  const code = z.string().regex(/^[A-Z]{2}$/).parse(marketCode.toUpperCase());
  const market = await db.market.findUnique({ where: { code }, select: { id: true } });
  if (!market) throw new UserError("Unknown market.");
  const entry = businessEntrySchema.parse(raw);
  const current = (await getSettings()).business ?? {};
  return writeAll(actorId, { business: { ...current, [code]: entry } }, "settings.business");
}

export async function saveTemplateOverride(actorId: string, type: string, raw: z.input<typeof templateOverrideSchema>) {
  if (!TEMPLATE_TYPES.includes(type as NotificationType)) throw new UserError("Unknown notification type.");
  const o = templateOverrideSchema.parse(raw);
  const clean = Object.fromEntries(Object.entries(o).filter(([, v]) => v)) as { subject?: string; heading?: string; body?: string };
  const current = { ...((await getSettings()).notificationTemplates ?? {}) };
  if (Object.keys(clean).length) current[type] = clean;
  else delete current[type];
  return writeAll(actorId, { notificationTemplates: current }, "settings.template");
}

/** Outgoing webhook alerts (D-122). URLs are secrets-ish: audit logs keep only label + host. */
export async function saveAlertWebhooks(actorId: string, raw: unknown) {
  const hooks = alertWebhooksSchema.parse(raw) as AlertWebhook[];
  const ids = new Set<string>();
  for (const h of hooks) {
    if (ids.has(h.id)) throw new UserError("Duplicate webhook id.");
    ids.add(h.id);
  }
  const before = (await getSettings()).alertWebhooks ?? [];
  const summary = (list: { id: string; url: string; label: string; events: string[]; enabled: boolean }[]) =>
    list.map((h) => ({ id: h.id, label: h.label, host: safeHost(h.url), events: h.events, enabled: h.enabled }));
  if (JSON.stringify(before) === JSON.stringify(hooks)) return { changed: 0 };
  await setSetting("alertWebhooks", hooks);
  await audit({ actorId, action: "settings.alert_webhooks", entity: "Setting", entityId: "alertWebhooks", before: summary(before), after: summary(hooks) });
  return { changed: 1 };
}

function safeHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "?";
  }
}

/** Sample text for the template editor (default subject/heading/body with placeholder values). */
export function templateDefaults() {
  const sample = new Proxy({}, { get: (_t, k) => (typeof k === "string" ? `{${k}}` : undefined) }) as Record<string, string>;
  return TEMPLATE_TYPES.map((type) => {
    const tpl = TEMPLATES[type] as unknown as { title: (p: Record<string, string>) => string; body: (p: Record<string, string>) => string; subject?: (p: Record<string, string>) => string; mandatory?: boolean; inAppOnly?: boolean };
    let title = "";
    let body = "";
    let subject = "";
    try {
      title = tpl.title(sample);
      body = tpl.body(sample);
      subject = tpl.subject?.(sample) ?? title;
    } catch {
      // template needs real data; leave blank
    }
    return { type, title, body, subject, mandatory: Boolean(tpl.mandatory), inAppOnly: Boolean(tpl.inAppOnly) };
  });
}

// ─────────────────────────── Resume styles (§9.3) ───────────────────────────

export const styleInputSchema = z.object({
  id: z.string().optional(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{1,39}$/, "Use capital letters, digits and underscores, e.g. UK_CV."),
  name: z.string().trim().min(2, "Enter a name.").max(80),
  documentTitle: z.string().trim().min(2).max(60),
  pageSize: z.enum(["LETTER", "A4"]),
  maxPages: z.coerce.number().int().min(1, "At least 1 page.").max(4, "At most 4 pages."),
  dateFormat: z.enum(["MMM yyyy", "MMMM yyyy", "MM/yyyy", "yyyy-MM"]),
  spelling: z.string().trim().regex(/^[a-z]{2}(-[A-Z]{2})?$/, "Use a locale like en-US or en-GB."),
  includePhoto: z.boolean(),
  includeDob: z.boolean(),
  includeNationality: z.boolean(),
  includeFullAddress: z.boolean(),
  summaryLabel: z.string().trim().min(2).max(60),
  sectionOrder: z
    .array(z.enum(SECTION_KEYS))
    .min(3, "Keep at least three sections.")
    .refine((a) => new Set(a).size === a.length, "Each section can appear once.")
    .refine((a) => a.includes("experience"), "Experience must be included."),
  rulesPrompt: z.string().trim().max(4000),
});
export type StyleInput = z.input<typeof styleInputSchema>;

const STYLE_SELECT = {
  id: true,
  code: true,
  name: true,
  documentTitle: true,
  pageSize: true,
  maxPages: true,
  dateFormat: true,
  spelling: true,
  includePhoto: true,
  includeDob: true,
  includeNationality: true,
  includeFullAddress: true,
  summaryLabel: true,
  sectionOrder: true,
  rulesPrompt: true,
  markets: { select: { code: true, name: true } },
} as const;

export async function listResumeStyles() {
  const [styles, templates] = await Promise.all([
    db.resumeStyle.findMany({ orderBy: { code: "asc" }, select: STYLE_SELECT }),
    db.resumeTemplate.findMany({ orderBy: { name: "asc" }, select: { id: true, code: true, name: true, isActive: true } }),
  ]);
  return { styles, templates };
}

export async function saveResumeStyle(actorId: string, raw: StyleInput) {
  const input = styleInputSchema.parse(raw);
  const clash = await db.resumeStyle.findUnique({ where: { code: input.code }, select: { id: true } });
  if (clash && clash.id !== input.id) throw new UserError("Another style already uses this code.", "code");
  const { id, ...data } = input;
  if (id) {
    const before = await db.resumeStyle.findUnique({ where: { id }, select: STYLE_SELECT });
    if (!before) throw new UserError("Style not found.");
    if (before.code !== data.code) {
      const used = await db.resumeVersion.count({ where: { styleCode: before.code } });
      if (used) throw new UserError("This style's code is used by existing resumes and can't be changed.", "code");
    }
    await db.resumeStyle.update({ where: { id }, data });
    await audit({ actorId, action: "resume_style.update", entity: "ResumeStyle", entityId: id, before: { ...before, markets: undefined }, after: data });
    return { id };
  }
  const created = await db.resumeStyle.create({ data, select: { id: true } });
  await audit({ actorId, action: "resume_style.create", entity: "ResumeStyle", entityId: created.id, after: data });
  return created;
}

export async function deleteResumeStyle(actorId: string, id: string) {
  const s = await db.resumeStyle.findUnique({ where: { id }, select: { code: true, _count: { select: { markets: true } } } });
  if (!s) throw new UserError("Style not found.");
  if (s._count.markets) throw new UserError("Markets still use this style. Pick another style for them first.");
  const used = await db.resumeVersion.count({ where: { styleCode: s.code } });
  if (used) throw new UserError("Existing resumes use this style, so it can't be deleted.");
  await db.resumeStyle.delete({ where: { id } });
  await audit({ actorId, action: "resume_style.delete", entity: "ResumeStyle", entityId: id, before: { code: s.code } });
  return { ok: true };
}

export async function setTemplateActive(actorId: string, id: string, isActive: boolean) {
  const t = await db.resumeTemplate.findUnique({ where: { id }, select: { isActive: true, code: true } });
  if (!t) throw new UserError("Template not found.");
  if (!isActive) {
    const remaining = await db.resumeTemplate.count({ where: { isActive: true, NOT: { id } } });
    if (!remaining) throw new UserError("Keep at least one template active.");
  }
  await db.resumeTemplate.update({ where: { id }, data: { isActive } });
  await audit({ actorId, action: "resume_template.toggle", entity: "ResumeTemplate", entityId: id, before: { isActive: t.isActive }, after: { isActive } });
  return { ok: true };
}
