import "server-only";
import type { Role } from "@/generated/prisma/enums";
import { db, Prisma } from "@/server/db";
import { ForbiddenError } from "@/server/auth/access";
import { UserError } from "@/server/errors";
import { ResumeJSON, emptyResume, type ResumeData } from "@/resume/schema";
import { linksSchema, personalSchema, preferencesSchema, SPONSORSHIP_AUTH, type LinksInput, type PersonalInput, type PreferencesInput } from "@/lib/schemas/student";
import { toMinor, fromMinor } from "@/lib/format";
import { phoneSchema } from "@/lib/schemas/auth";
import { extractText, getLatestParse, parseMaster } from "./resumes";
import { LIMITS, storeUpload } from "./files";
import { audit } from "./audit";
import { enforceRateLimit } from "./ratelimit";

/**
 * Student-owned profile data (SPEC F3 + /app/profile): personal info, job
 * preferences, links, master profile (ResumeJSON) and the resume upload that
 * seeds it. Every function takes the acting user and only touches their own
 * StudentProfile.
 */

/** User-visible validation error (a UserError, so safeAction shows the message). */
export class StudentProfileError extends UserError {}

type Actor = { id: string; role: Role };

export async function studentIdFor(user: Actor) {
  if (user.role !== "STUDENT") throw new ForbiddenError();
  const s = await db.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!s) throw new ForbiddenError();
  return s.id;
}

/** Everything the profile page + onboarding wizard need (no secrets). */
export async function getStudentProfile(user: Actor) {
  const s = await db.studentProfile.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      onboardingStep: true,
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
      consentVersion: true,
      user: { select: { name: true, email: true, phone: true, timezone: true, emailVerified: true } },
      market: { select: { code: true, name: true, currency: true, defaultTimezone: true } },
    },
  });
  if (!s) throw new ForbiddenError();
  const { master, issues } = parseMaster(s.masterProfile);
  const currency = s.salaryCurrency ?? s.market.currency;
  return {
    studentId: s.id,
    onboardingStep: s.onboardingStep,
    onboardingCompletedAt: s.onboardingCompletedAt,
    consentApplyOnBehalfAt: s.consentApplyOnBehalfAt,
    consentVersion: s.consentVersion,
    personal: { name: s.user.name, email: s.user.email, phone: s.user.phone ?? "", timezone: s.user.timezone, emailVerified: Boolean(s.user.emailVerified) },
    market: s.market,
    preferences: {
      targetTitles: s.targetTitles,
      seniority: s.seniority ?? "",
      industries: s.industries,
      locations: s.locations,
      remoteOk: s.remoteOk,
      workModes: s.workModes,
      employmentTypes: s.employmentTypes,
      minSalary: s.minSalaryMinor === null ? null : fromMinor(s.minSalaryMinor, currency),
      salaryCurrency: currency,
      workAuthorization: s.workAuthorization ?? "",
      willingToRelocate: s.willingToRelocate,
      noticePeriod: s.noticePeriod ?? "",
      avoidCompanies: s.avoidCompanies,
      targetCompanies: s.targetCompanies,
    },
    hasPreferences: s.targetTitles.length > 0 && s.workModes.length > 0 && Boolean(s.workAuthorization),
    links: { linkedinUrl: s.linkedinUrl ?? "", githubUrl: s.githubUrl ?? "", portfolioUrl: s.portfolioUrl ?? "" },
    master,
    masterIssues: s.masterProfile ? issues : [],
    /** A starting point for manual entry when nothing was parsed yet. */
    blankMaster: emptyResume({ name: s.user.name, email: s.user.email, phone: s.user.phone, country: s.market.name }),
  };
}

export type StudentProfileData = Awaited<ReturnType<typeof getStudentProfile>>;

// ─────────────────────────── Cores shared with the admin panel (D-147) ───────────────────────────
// `apply*` take a studentId and are used by both the student self-service path
// (below, after `studentIdFor`) and the admin edit path (admin-student-accounts.ts),
// so the stored shape is identical whoever saves.

/** Validate + normalise job preferences into the StudentProfile columns. */
export function preferencesData(raw: PreferencesInput) {
  const p = preferencesSchema.parse(raw);
  const currency = p.salaryCurrency ?? "USD";
  return {
    targetTitles: p.targetTitles,
    seniority: p.seniority,
    industries: p.industries,
    locations: p.locations,
    remoteOk: p.remoteOk,
    workModes: p.workModes,
    employmentTypes: p.employmentTypes,
    minSalaryMinor: p.minSalary === null ? null : toMinor(p.minSalary, currency),
    salaryCurrency: currency,
    workAuthorization: p.workAuthorization,
    needsSponsorship: SPONSORSHIP_AUTH.has(p.workAuthorization),
    willingToRelocate: p.willingToRelocate,
    noticePeriod: p.noticePeriod || null,
    avoidCompanies: p.avoidCompanies,
    targetCompanies: p.targetCompanies,
  };
}

export async function applyPreferences(studentId: string, raw: PreferencesInput) {
  const data = preferencesData(raw);
  await db.studentProfile.update({ where: { id: studentId }, data });
  return data;
}

export function linksData(raw: LinksInput) {
  const l = linksSchema.parse(raw);
  return { linkedinUrl: l.linkedinUrl, githubUrl: l.githubUrl, portfolioUrl: l.portfolioUrl };
}

export async function applyLinks(studentId: string, raw: LinksInput) {
  const data = linksData(raw);
  await db.studentProfile.update({ where: { id: studentId }, data });
  return data;
}

/** Name / phone / timezone on the User row; the phone is validated for the student's market. */
export async function applyPersonal(studentId: string, raw: PersonalInput) {
  const p = personalSchema.parse(raw);
  const s = await db.studentProfile.findUnique({ where: { id: studentId }, select: { userId: true, market: { select: { code: true } } } });
  if (!s) throw new ForbiddenError();
  const phone = phoneSchema(s.market.code ?? "US").safeParse(p.phone);
  if (!phone.success) throw new StudentProfileError("Enter a valid phone number with country code.", "phone");
  const data = { name: p.name, phone: phone.data, timezone: p.timezone };
  await db.user.update({ where: { id: s.userId }, data });
  return data;
}

export async function savePreferences(user: Actor, raw: PreferencesInput) {
  const studentId = await studentIdFor(user);
  await applyPreferences(studentId, raw);
}

export async function saveLinks(user: Actor, raw: LinksInput) {
  const studentId = await studentIdFor(user);
  await applyLinks(studentId, raw);
}

export async function savePersonal(user: Actor, raw: PersonalInput) {
  const studentId = await studentIdFor(user);
  await applyPersonal(studentId, raw);
}

const SECTION_LABEL: Record<string, string> = {
  basics: "Contact details",
  summary: "Summary",
  skills: "Skills",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  certifications: "Certifications",
  languages: "Languages",
  awards: "Awards",
};
const FIELD_LABEL: Record<string, string> = {
  name: "name",
  email: "email",
  startDate: "start date",
  endDate: "end date",
  url: "link",
  company: "company",
  title: "job title",
  institution: "school",
  degree: "degree",
  group: "group name",
};

/** "experience.1.startDate: Use YYYY-MM" → "Experience 2 – start date: Use YYYY-MM". */
export function describeResumeIssue(path: (string | number | symbol)[], message: string) {
  const [section, idx, ...rest] = path.map(String);
  const label = SECTION_LABEL[section ?? ""] ?? section ?? "Profile";
  const n = idx !== undefined && /^\d+$/.test(idx) ? ` ${Number(idx) + 1}` : idx ? ` – ${FIELD_LABEL[idx] ?? idx}` : "";
  const field = rest.filter((r) => !/^\d+$/.test(r)).pop();
  return `${label}${n}${field ? ` – ${FIELD_LABEL[field] ?? field}` : ""}: ${message}`;
}

/** Validate + clean a master profile coming from the editor. */
export function cleanMasterProfile(raw: unknown): ResumeData {
  const r = ResumeJSON.safeParse(raw);
  if (!r.success) {
    const i = r.error.issues[0]!;
    throw new StudentProfileError(describeResumeIssue(i.path, i.message));
  }
  const d = r.data;
  const t = (s: string | undefined) => (s ?? "").trim();
  const out: ResumeData = {
    ...d,
    basics: {
      ...d.basics,
      name: t(d.basics.name),
      headline: t(d.basics.headline) || undefined,
      links: d.basics.links.filter((l) => l.url.trim()),
    },
    summary: t(d.summary),
    skills: d.skills.map((g) => ({ group: t(g.group) || "Skills", items: [...new Set(g.items.map((x) => x.trim()).filter(Boolean))] })).filter((g) => g.items.length),
    experience: d.experience
      .filter((e) => t(e.company) || t(e.title))
      .map((e) => ({ ...e, company: t(e.company), title: t(e.title), location: t(e.location) || undefined, bullets: e.bullets.filter((b) => b.text.trim()).map((b) => ({ ...b, text: b.text.trim() })), technologies: [...new Set(e.technologies.map((x) => x.trim()).filter(Boolean))] })),
    projects: d.projects.filter((p) => t(p.name)).map((p) => ({ ...p, bullets: p.bullets.map((b) => b.trim()).filter(Boolean), link: t(p.link) || undefined })),
    education: d.education.filter((e) => t(e.institution) || t(e.degree)),
    certifications: d.certifications.filter((c) => t(c.name)),
    awards: d.awards.map((a) => a.trim()).filter(Boolean),
    languages: d.languages.filter((l) => t(l.name)),
  };
  for (const [i, e] of out.experience.entries()) {
    if (!e.company || !e.title) throw new StudentProfileError(describeResumeIssue(["experience", i], "Add both the company and your job title."));
    if (e.endDate && e.endDate < e.startDate) throw new StudentProfileError(describeResumeIssue(["experience", i, "endDate"], "The end date is before the start date."));
  }
  for (const [i, e] of out.education.entries()) {
    if (!e.institution || !e.degree) throw new StudentProfileError(describeResumeIssue(["education", i], "Add both the school and the degree."));
  }
  if (!out.basics.name) throw new StudentProfileError("Contact details – name: Enter your name.");
  return out;
}

/** Save the student-edited master profile (the single source of truth for every resume). */
export async function saveMasterProfile(user: Actor, raw: unknown) {
  const studentId = await studentIdFor(user);
  const content = cleanMasterProfile(raw);
  await db.studentProfile.update({ where: { id: studentId }, data: { masterProfile: content as unknown as Prisma.InputJsonValue } });
  await audit({ actorId: user.id, action: "student.master_profile_saved", entity: "StudentProfile", entityId: studentId });
  return content;
}

/**
 * F3 step 1: validate + store the upload (PDF/DOCX ≤ 5 MB, magic-number
 * check), make sure it has extractable text (so scanned images fail fast with
 * a clear message), then the caller emits "resume.parse".
 */
export async function storeResumeUpload(user: Actor, file: { buffer: Buffer; filename?: string }) {
  const studentId = await studentIdFor(user);
  await enforceRateLimit("upload", user.id);
  const stored = await storeUpload({
    buffer: file.buffer,
    filename: file.filename,
    ownerUserId: user.id,
    studentId,
    purpose: "resume",
    allowed: ["pdf", "docx"],
    maxBytes: LIMITS.resume,
    keyPrefix: `students/${studentId}/uploads`,
  });
  let text = "";
  try {
    text = (await extractText(file.buffer, stored.mime)).replace(/\u0000/g, "").trim();
  } catch {
    text = "";
  }
  if (text.length < 80) {
    throw new StudentProfileError("We couldn't read any text from this file. If it's a scanned image, upload a text-based PDF or a DOCX.", "file");
  }
  return { studentId, fileId: stored.id, key: stored.key };
}

/** Polled by the wizard while "resume.parse" runs. Done when the parse for this upload is saved. */
export async function getParseStatus(user: Actor, fileId: string) {
  const studentId = await studentIdFor(user);
  const file = await db.fileObject.findFirst({ where: { id: fileId, studentId, purpose: "resume" }, select: { key: true, createdAt: true } });
  if (!file) throw new ForbiddenError();
  const latest = await getLatestParse(studentId);
  if (!latest || latest.originalFileKey !== file.key) {
    const waitedSeconds = Math.round((Date.now() - file.createdAt.getTime()) / 1000);
    return { done: false as const, waitedSeconds };
  }
  const s = await db.studentProfile.findUnique({ where: { id: studentId }, select: { masterProfile: true } });
  const { master } = parseMaster(s?.masterProfile);
  return { done: true as const, method: latest.method, warnings: latest.warnings, master };
}

/** The most recent uploaded resume (for "Your uploaded file" links). */
export async function getLatestUpload(studentId: string) {
  return db.fileObject.findFirst({ where: { studentId, purpose: "resume", key: { contains: "/uploads/" } }, orderBy: { createdAt: "desc" }, select: { id: true, filename: true, createdAt: true, size: true } });
}
