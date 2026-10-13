import "server-only";
import crypto from "node:crypto";
import type { Role } from "@/generated/prisma/enums";
import { db, Prisma } from "@/server/db";
import { UserError } from "@/server/errors";
import { assertEmployeeCanAccessStudent, ForbiddenError, hasActiveAssignment } from "@/server/auth/access";
import { ResumeJSON, allProfileSkills, emptyResume, type ResumeData } from "@/resume/schema";
import { FALLBACK_STYLE, asTemplate, resumeFileName, toRenderStyle, type RenderStyle } from "@/resume/styles";
import { normalizeParsedResume } from "@/resume/normalize";
import { heuristicParseResume } from "@/resume/parse-heuristic";
import { AiNotConfiguredError, AiOutputError, aiConfigured, callTool } from "@/server/ai/client";
import { CoverLetterOutput, JdAnalysis, ParsedResume, TailorOutput, type JdAnalysisData } from "@/server/ai/schemas";
import { analyzeJdPrompt, coverLetterPrompt, parseResumePrompt, tailorResumePrompt, type StyleForPrompt } from "@/server/ai/prompts";
import { errorsForPrompt, numbersIn, validateTailored, type ValidationResult } from "@/server/ai/validators";
import { computeAtsScore, type AtsBreakdown } from "@/server/ai/ats-score";
import { heuristicJdAnalysis } from "@/server/ai/jd-heuristic";
import { enforceRateLimit } from "./ratelimit";
import { getSetting } from "./settings";
import { readObject, storeGenerated } from "./files";
import { log } from "@/server/log";

/**
 * Resume engine services (SPEC §9): parsing, JD analysis (cached), tailoring
 * with validator + retry, ATS scoring, cover letters, rendering cache, access.
 */

export class ResumeError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = "ResumeError";
  }
}

type Actor = { id: string; role: Role };

export const JD_MIN = 200;
export const JD_MAX = 20_000;
const JD_CACHE_DAYS = 30;

// ─────────────────────────── Access ───────────────────────────

/** Staff (assigned employee / manager / admin) or the student themself. */
export async function assertCanAccessStudentResumes(user: Actor, studentId: string) {
  if (user.role === "STUDENT") {
    const s = await db.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (s?.id !== studentId) throw new ForbiddenError();
    return;
  }
  await assertEmployeeCanAccessStudent(user, studentId);
}

/**
 * May this user download / preview a resume version? Student owner; actively
 * assigned employee; an employee who logged an application with it; manager/admin.
 */
export async function canAccessVersion(user: Actor | null, version: { id: string; studentId: string }): Promise<boolean> {
  if (!user) return false;
  if (user.role === "ADMIN" || user.role === "MANAGER") return true;
  if (user.role === "STUDENT") {
    const s = await db.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    return s?.id === version.studentId;
  }
  const ep = await db.employeeProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!ep) return false;
  if (await hasActiveAssignment(ep.id, version.studentId)) return true;
  return (await db.jobApplication.count({ where: { resumeVersionId: version.id, employeeId: ep.id } })) > 0;
}

// ─────────────────────────── Style & context ───────────────────────────

export type StudentResumeContext = {
  studentId: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  timezone: string;
  market: { code: string; name: string };
  style: RenderStyle & { name: string; rulesPrompt: string };
  templateCode: string;
  master: ResumeData | null;
  masterIssues: string[];
};

const STYLE_SELECT = {
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
} satisfies Prisma.ResumeStyleSelect;

export async function getStyleByCode(code: string): Promise<RenderStyle & { name: string; rulesPrompt: string }> {
  const s = await db.resumeStyle.findUnique({ where: { code }, select: STYLE_SELECT });
  if (!s) return { ...FALLBACK_STYLE, name: "US Resume", rulesPrompt: "" };
  return { ...toRenderStyle(s), name: s.name, rulesPrompt: s.rulesPrompt };
}

export function parseMaster(json: unknown): { master: ResumeData | null; issues: string[] } {
  if (!json) return { master: null, issues: ["No master profile yet."] };
  const r = ResumeJSON.safeParse(json);
  if (r.success) return { master: r.data, issues: [] };
  return { master: null, issues: r.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) };
}

export async function getStudentResumeContext(studentId: string): Promise<StudentResumeContext> {
  const s = await db.studentProfile.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      templateId: true,
      masterProfile: true,
      user: { select: { id: true, name: true, email: true, phone: true, timezone: true } },
      market: { select: { code: true, name: true, resumeStyle: { select: STYLE_SELECT } } },
    },
  });
  if (!s) throw new ResumeError("Student not found.");
  const st = s.market.resumeStyle;
  const { master, issues } = parseMaster(s.masterProfile);
  return {
    studentId: s.id,
    userId: s.user.id,
    name: s.user.name,
    email: s.user.email,
    phone: s.user.phone,
    timezone: s.user.timezone,
    market: { code: s.market.code, name: s.market.name },
    style: { ...toRenderStyle(st), name: st.name, rulesPrompt: st.rulesPrompt },
    templateCode: asTemplate(s.templateId),
    master,
    masterIssues: issues,
  };
}

function styleForPrompt(s: StudentResumeContext["style"]): StyleForPrompt {
  return { ...s, pageSize: s.pageSize };
}

// ─────────────────────────── Rate limits ───────────────────────────

export async function enforceAiLimits(user: Actor, studentId: string | null) {
  const limits = await getSetting("aiLimits");
  if (user.role !== "STUDENT") await enforceRateLimit("aiEmployee", user.id, { tokens: limits.employeePerHour });
  if (studentId) await enforceRateLimit("aiStudent", studentId, { tokens: limits.studentPerDay });
}

// ─────────────────────────── Parsing (F3 step 1) ───────────────────────────

export async function extractText(buffer: Buffer, mime: string): Promise<string> {
  if (mime === "application/pdf" || buffer.subarray(0, 5).toString("latin1") === "%PDF-") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const r = await parser.getText();
      return r.text;
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }
  if (mime.includes("wordprocessingml") || buffer.subarray(0, 2).toString("latin1") === "PK") {
    const mammoth = await import("mammoth");
    const r = await mammoth.extractRawText({ buffer });
    return r.value;
  }
  if (mime.startsWith("text/")) return buffer.toString("utf8");
  throw new ResumeError("Unsupported resume file. Upload a PDF or DOCX.");
}

export type ParseResult = { resume: ResumeData; method: "ai" | "heuristic"; warnings: string[]; textLength: number };

/**
 * Uploaded resume → validated ResumeJSON master profile (F3 step 1).
 * Uses Claude when configured; otherwise (or if the AI output is unusable) a
 * best-effort heuristic parse, flagged with method "heuristic".
 * Does NOT save anything — see `saveParsedMasterProfile` / the "resume.parse" job.
 */
export async function parseUploadedResume(studentId: string, source: { fileKey: string } | { buffer: Buffer }, mime: string, opts: { actorUserId?: string } = {}): Promise<ParseResult> {
  const ctx = await getStudentResumeContext(studentId);
  const buffer = "buffer" in source ? source.buffer : await readObject(source.fileKey);
  const text = (await extractText(buffer, mime)).replace(/\u0000/g, "").trim();
  if (text.length < 80) throw new ResumeError("We couldn't read any text from this file. If it's a scanned image, upload a text-based PDF or DOCX.");
  const fallback = { name: ctx.name, email: ctx.email, phone: ctx.phone, country: ctx.market.name };
  const actorId = opts.actorUserId ?? ctx.userId;

  if (aiConfigured()) {
    try {
      await enforceAiLimits({ id: actorId, role: "STUDENT" }, studentId);
      const p = parseResumePrompt({ text, marketName: ctx.market.name });
      const { data } = await callTool({
        task: "parse_resume",
        schema: ParsedResume,
        toolName: "save_master_profile",
        toolDescription: "Save the structured master profile parsed from the resume.",
        system: p.system,
        messages: [{ role: "user", content: p.user }],
        maxTokens: 8000,
        temperature: 0,
        userId: actorId,
        studentId,
      });
      const n = normalizeParsedResume(data, fallback);
      return { resume: n.resume, method: "ai", warnings: n.warnings, textLength: text.length };
    } catch (e) {
      if (!(e instanceof AiOutputError) && !(e instanceof UserError) && !(e instanceof AiNotConfiguredError)) throw e;
      log.warn("resume.parse_ai_failed_fallback", { err: e });
    }
  }
  const n = normalizeParsedResume(heuristicParseResume(text), fallback);
  return {
    resume: n.resume,
    method: "heuristic",
    warnings: ["This profile was read automatically without AI. Please review every section carefully.", ...n.warnings],
    textLength: text.length,
  };
}

/** Save a parse result as the master profile + a MASTER_UPLOAD ResumeVersion. */
export async function saveParsedMasterProfile(input: { studentId: string; result: ParseResult; originalFileKey: string | null; createdById: string }) {
  const ctx = await getStudentResumeContext(input.studentId);
  const content = input.result.resume as unknown as Prisma.InputJsonValue;
  return db.$transaction(async (tx) => {
    await tx.studentProfile.update({ where: { id: input.studentId }, data: { masterProfile: content } });
    return tx.resumeVersion.create({
      data: {
        studentId: input.studentId,
        kind: "MASTER_UPLOAD",
        title: "Uploaded resume",
        content,
        styleCode: ctx.style.code,
        templateCode: ctx.templateCode,
        originalFileKey: input.originalFileKey,
        validation: { parse: { method: input.result.method, warnings: input.result.warnings, parsedAt: new Date().toISOString() } } as Prisma.InputJsonValue,
        createdById: input.createdById,
      },
      select: { id: true },
    });
  });
}

/** Latest parse status for the onboarding UI ("method" = ai | heuristic). */
export async function getLatestParse(studentId: string) {
  const v = await db.resumeVersion.findFirst({
    where: { studentId, kind: "MASTER_UPLOAD" },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, validation: true, originalFileKey: true },
  });
  if (!v) return null;
  const parse = (v.validation as { parse?: { method: "ai" | "heuristic"; warnings: string[]; parsedAt: string } } | null)?.parse ?? null;
  return { versionId: v.id, createdAt: v.createdAt, originalFileKey: v.originalFileKey, method: parse?.method ?? null, warnings: parse?.warnings ?? [] };
}

// ─────────────────────────── JD analysis (cached) ───────────────────────────

export const jdHash = (jd: string) => crypto.createHash("sha256").update(jd.replace(/\r\n/g, "\n").trim()).digest("hex");

export type JdAnalysisWithMeta = JdAnalysisData & { method: "ai" | "heuristic" };

export async function analyzeJd(input: { user: Actor; studentId: string; jd: string; title: string; company: string; profileSkills: string[] }): Promise<{ analysis: JdAnalysisWithMeta; hash: string; cached: boolean }> {
  const hash = jdHash(input.jd);
  const since = new Date(Date.now() - JD_CACHE_DAYS * 86400e3);
  const hit = await db.jdAnalysisCache.findUnique({ where: { hash }, select: { analysis: true, createdAt: true } });
  if (hit && hit.createdAt > since) {
    const parsed = JdAnalysis.safeParse(hit.analysis);
    if (parsed.success) return { analysis: { ...parsed.data, method: "ai" }, hash, cached: true };
  }
  if (!aiConfigured()) {
    // Not cached: heuristic results depend on the student's profile skills.
    return { analysis: heuristicJdAnalysis({ jd: input.jd, title: input.title, profileSkills: input.profileSkills }), hash, cached: false };
  }
  const p = analyzeJdPrompt({ jd: input.jd, title: input.title, company: input.company });
  const { data } = await callTool({
    task: "analyze_jd",
    tier: "fast",
    schema: JdAnalysis,
    toolName: "save_jd_analysis",
    toolDescription: "Save the structured analysis of the job description.",
    system: p.system,
    messages: [{ role: "user", content: p.user }],
    maxTokens: 2000,
    temperature: 0,
    userId: input.user.id,
    studentId: input.studentId,
  });
  await db.jdAnalysisCache.upsert({
    where: { hash },
    update: { analysis: data as unknown as Prisma.InputJsonValue, createdAt: new Date() },
    create: { hash, analysis: data as unknown as Prisma.InputJsonValue },
  });
  return { analysis: { ...data, method: "ai" }, hash, cached: false };
}

/** Nightly cleanup of expired JD analyses. */
export async function purgeJdCache(now = new Date()) {
  const r = await db.jdAnalysisCache.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - JD_CACHE_DAYS * 86400e3) } } });
  return r.count;
}

// ─────────────────────────── Base resume ───────────────────────────

/** JSON with sorted keys (Postgres jsonb doesn't preserve key order); undefined fields dropped. */
export function stableStringify(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val) ? Object.fromEntries(Object.entries(val as Record<string, unknown>).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : val,
  );
}

/** Latest BASE version matching the current master profile (created if the master changed). */
export async function getOrCreateBaseVersion(user: Actor, studentId: string) {
  const ctx = await getStudentResumeContext(studentId);
  if (!ctx.master) throw new ResumeError("This student's master profile isn't ready yet. Ask them to finish onboarding (resume upload).");
  const latest = await db.resumeVersion.findFirst({ where: { studentId, kind: "BASE" }, orderBy: { createdAt: "desc" }, select: { id: true, content: true } });
  if (latest && stableStringify(latest.content) === stableStringify(ctx.master)) return { id: latest.id, created: false };
  const v = await db.resumeVersion.create({
    data: {
      studentId,
      kind: "BASE",
      title: `Base ${ctx.style.documentTitle.toLowerCase()}`,
      content: ctx.master as unknown as Prisma.InputJsonValue,
      styleCode: ctx.style.code,
      templateCode: ctx.templateCode,
      validation: { ok: true, errors: [], warnings: [], checkedAt: new Date().toISOString() } as Prisma.InputJsonValue,
      createdById: user.id,
    },
    select: { id: true },
  });
  return { id: v.id, created: true };
}

// ─────────────────────────── Tailoring pipeline (F4) ───────────────────────────

export type TailorStep = "analysing" | "tailoring" | "validating" | "scoring" | "rendering" | "done";
export type TailorInput = { studentId: string; jd: string; company: string; title: string; location?: string | null };

export type StoredValidation = ValidationResult & { attempts: number; aiUnavailable?: boolean };

export type TailorResult = {
  versionId: string;
  content: ResumeData;
  analysis: JdAnalysisWithMeta;
  validation: StoredValidation;
  base: AtsBreakdown;
  tailored: AtsBreakdown;
  pages: number;
  aiUnavailable: boolean;
};

/** Keep the student's own contact details no matter what the model returned. */
function pinIdentity(out: ResumeData, master: ResumeData, style: RenderStyle): ResumeData {
  return {
    ...out,
    basics: {
      ...master.basics,
      photoKey: style.includePhoto ? master.basics.photoKey : undefined,
      dateOfBirth: style.includeDob ? master.basics.dateOfBirth : undefined,
      nationality: style.includeNationality ? master.basics.nationality : undefined,
    },
    meta: { hiddenSections: out.meta?.hiddenSections ?? [], sectionOrder: out.meta?.sectionOrder ?? style.sectionOrder },
  };
}

async function generateTailored(ctx: StudentResumeContext & { master: ResumeData }, input: TailorInput, analysis: JdAnalysisData, user: Actor, previousErrors?: string[]) {
  const p = tailorResumePrompt({
    style: styleForPrompt(ctx.style),
    market: ctx.market,
    master: ctx.master,
    job: { title: input.title, company: input.company, location: input.location },
    analysis,
    jd: input.jd,
    previousErrors,
  });
  const { data } = await callTool({
    task: "tailor_resume",
    schema: TailorOutput,
    toolName: "save_tailored_resume",
    toolDescription: "Save the tailored resume JSON (same schema as the master profile).",
    system: p.system,
    messages: [{ role: "user", content: p.user }],
    maxTokens: 8000,
    temperature: 0.3,
    userId: user.id,
    studentId: ctx.studentId,
  });
  return pinIdentity(data, ctx.master, ctx.style);
}

/**
 * JD → analysis (cached) → tailor → validate (+1 retry with the error list) →
 * ATS base vs tailored → render (page count) → save an unlocked TAILORED version.
 * Without an API key, the JD is analysed heuristically and the base resume is
 * used as the starting point (flagged `aiUnavailable`) so work can continue.
 */
export async function tailorResume(user: Actor, input: TailorInput, onStep: (s: TailorStep) => void | Promise<void> = () => undefined): Promise<TailorResult> {
  await assertEmployeeCanAccessStudent(user, input.studentId);
  const jd = input.jd.trim();
  if (jd.length < JD_MIN) throw new ResumeError(`Paste the full job description (at least ${JD_MIN} characters).`, "jd");
  if (jd.length > JD_MAX) throw new ResumeError(`The job description is too long (max ${JD_MAX.toLocaleString("en-US")} characters).`, "jd");
  const ctx = await getStudentResumeContext(input.studentId);
  if (!ctx.master) throw new ResumeError("This student's master profile isn't ready yet, so there's nothing to tailor from.");
  const master = ctx.master;
  const ai = aiConfigured();
  if (ai) await enforceAiLimits(user, input.studentId);

  await onStep("analysing");
  const { analysis, hash } = await analyzeJd({ user, studentId: input.studentId, jd, title: input.title, company: input.company, profileSkills: allProfileSkills(master) });

  await onStep("tailoring");
  let content: ResumeData;
  let attempts = 0;
  let validation: ValidationResult;
  if (!ai) {
    content = pinIdentity(master, master, ctx.style);
    await onStep("validating");
    validation = validateTailored(master, content);
  } else {
    attempts = 1;
    let candidate: ResumeData | null = null;
    let errs: string[] | undefined;
    try {
      candidate = await generateTailored({ ...ctx, master }, { ...input, jd }, analysis, user);
    } catch (e) {
      if (!(e instanceof AiOutputError)) throw e;
      errs = e.issues;
    }
    await onStep("validating");
    validation = candidate ? validateTailored(master, candidate) : { ok: false, errors: [], warnings: [], checkedAt: new Date().toISOString() };
    if (!candidate || !validation.ok) {
      // Auto-retry once with the error list (SPEC §9.4).
      attempts = 2;
      await onStep("tailoring");
      try {
        candidate = await generateTailored({ ...ctx, master }, { ...input, jd }, analysis, user, errs ?? errorsForPrompt(validation));
      } catch (e) {
        if (!(e instanceof AiOutputError)) throw e;
        if (!candidate) throw new ResumeError("The AI couldn't produce a valid resume. Please try again.");
      }
      await onStep("validating");
      validation = validateTailored(master, candidate);
    }
    content = candidate;
  }

  await onStep("scoring");
  await onStep("rendering");
  const { renderResumePdf } = await import("@/resume/render-pdf");
  const { pages } = await renderResumePdf({ resume: content, style: ctx.style, template: ctx.templateCode });
  validation = validateTailored(master, content, { maxPages: ctx.style.maxPages, pageCount: pages });
  const basePdf = await renderResumePdf({ resume: master, style: ctx.style, template: ctx.templateCode });
  const base = computeAtsScore({ resume: master, analysis, jobTitle: input.title, maxPages: ctx.style.maxPages, pageCount: basePdf.pages, includePhoto: ctx.style.includePhoto });
  const tailored = computeAtsScore({ resume: content, analysis, jobTitle: input.title, maxPages: ctx.style.maxPages, pageCount: pages, includePhoto: ctx.style.includePhoto });
  const stored: StoredValidation = { ...validation, attempts, aiUnavailable: !ai || undefined };

  const v = await db.resumeVersion.create({
    data: {
      studentId: input.studentId,
      kind: "TAILORED",
      title: `${input.title} – ${input.company}`.slice(0, 200),
      content: content as unknown as Prisma.InputJsonValue,
      styleCode: ctx.style.code,
      templateCode: ctx.templateCode,
      jdAnalysis: analysis as unknown as Prisma.InputJsonValue,
      jdHash: hash,
      atsScoreBase: base.score,
      atsScore: tailored.score,
      validation: stored as unknown as Prisma.InputJsonValue,
      createdById: user.id,
    },
    select: { id: true },
  });
  await onStep("done");
  return { versionId: v.id, content, analysis, validation: stored, base, tailored, pages, aiUnavailable: !ai };
}

// ─────────────────────────── Editor ───────────────────────────

async function loadEditableVersion(user: Actor, versionId: string) {
  const v = await db.resumeVersion.findUnique({
    where: { id: versionId },
    select: { id: true, studentId: true, kind: true, lockedAt: true, content: true, jdAnalysis: true, styleCode: true, templateCode: true, title: true, validation: true, coverLetter: true },
  });
  if (!v) throw new ResumeError("Resume version not found.");
  await assertEmployeeCanAccessStudent(user, v.studentId);
  return v;
}

export function versionIsLocked(v: { lockedAt: Date | null }) {
  return Boolean(v.lockedAt);
}

/**
 * Save editor changes to an unlocked version: re-validate against the master
 * profile, re-score, and drop cached renders. Locked versions are immutable.
 */
export async function updateVersionContent(user: Actor, versionId: string, contentInput: unknown, jobTitle?: string) {
  const v = await loadEditableVersion(user, versionId);
  if (v.lockedAt) throw new ResumeError("This resume was already used in an application and can't be changed. Generate a new one instead.");
  if (v.kind !== "TAILORED") throw new ResumeError("Only tailored resumes can be edited here. Edit the master profile instead.");
  const parsed = ResumeJSON.safeParse(contentInput);
  if (!parsed.success) throw new ResumeError(`The resume has invalid data: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
  const ctx = await getStudentResumeContext(v.studentId);
  const style = await getStyleByCode(v.styleCode);
  const content = ctx.master ? pinIdentity(parsed.data, ctx.master, style) : parsed.data;
  const { renderResumePdf } = await import("@/resume/render-pdf");
  const { pages } = await renderResumePdf({ resume: content, style, template: v.templateCode });
  const validation = ctx.master
    ? validateTailored(ctx.master, content, { maxPages: style.maxPages, pageCount: pages })
    : { ok: false, errors: [{ code: "schema" as const, severity: "error" as const, path: "master", message: "The master profile is missing." }], warnings: [], checkedAt: new Date().toISOString() };
  const prev = (v.validation as StoredValidation | null) ?? null;
  const stored: StoredValidation = { ...validation, attempts: prev?.attempts ?? 0, aiUnavailable: prev?.aiUnavailable };
  const analysis = JdAnalysis.safeParse(v.jdAnalysis);
  const title = jobTitle ?? v.title.split(" – ")[0] ?? "";
  const tailored = analysis.success ? computeAtsScore({ resume: content, analysis: analysis.data, jobTitle: title, maxPages: style.maxPages, pageCount: pages, includePhoto: style.includePhoto }) : null;
  const r = await db.resumeVersion.updateMany({
    where: { id: versionId, lockedAt: null },
    data: { content: content as unknown as Prisma.InputJsonValue, validation: stored as unknown as Prisma.InputJsonValue, atsScore: tailored?.score ?? undefined, pdfKey: null, docxKey: null },
  });
  if (r.count === 0) throw new ResumeError("This resume was locked by an application in the meantime and can't be changed.");
  return { validation: stored, tailored, pages, content };
}

export async function updateCoverLetter(user: Actor, versionId: string, text: string) {
  const v = await loadEditableVersion(user, versionId);
  if (v.lockedAt) throw new ResumeError("This resume (and its cover letter) is locked.");
  const clean = text.trim();
  const words = clean ? clean.split(/\s+/).length : 0;
  if (words > 250) throw new ResumeError(`Cover letters must be 250 words or fewer (currently ${words}).`, "coverLetter");
  await db.resumeVersion.update({ where: { id: versionId }, data: { coverLetter: clean || null } });
  return { words };
}

/** Cover letter (≤ 250 words, same truthfulness rules). */
export async function generateCoverLetter(user: Actor, input: { versionId: string; jd: string; company: string; title: string; location?: string | null }) {
  const v = await loadEditableVersion(user, input.versionId);
  if (v.lockedAt) throw new ResumeError("This resume is locked; generate a new tailored resume for a new cover letter.");
  if (!aiConfigured()) throw new AiNotConfiguredError();
  await enforceAiLimits(user, v.studentId);
  const ctx = await getStudentResumeContext(v.studentId);
  const resume = ResumeJSON.parse(v.content);
  const analysis = JdAnalysis.safeParse(v.jdAnalysis);
  const p = coverLetterPrompt({ style: styleForPrompt(ctx.style), market: ctx.market, resume, job: { title: input.title, company: input.company, location: input.location }, analysis: analysis.success ? analysis.data : null, jd: input.jd });
  const ask = async (extra?: string) =>
    (
      await callTool({
        task: "cover_letter",
        schema: CoverLetterOutput,
        toolName: "save_cover_letter",
        toolDescription: "Save the cover letter text.",
        system: p.system,
        messages: [{ role: "user", content: extra ? `${p.user}\n\n${extra}` : p.user }],
        maxTokens: 1200,
        temperature: 0.4,
        userId: user.id,
        studentId: v.studentId,
      })
    ).data.coverLetter.trim();
  let letter = await ask();
  const problems = coverLetterProblems(letter, ctx.master ?? resume);
  if (problems.length) letter = await ask(`Your previous draft had problems; fix them: ${problems.join(" ")}`);
  const words = letter.split(/\s+/).length;
  if (words > 250) letter = trimToWords(letter, 250);
  await db.resumeVersion.update({ where: { id: v.id }, data: { coverLetter: letter } });
  return { coverLetter: letter, warnings: coverLetterProblems(letter, ctx.master ?? resume) };
}

/**
 * Code checks for cover letters: length, placeholders, and numbers (metrics)
 * that don't appear anywhere in the student's profile.
 */
export function coverLetterProblems(letter: string, master: ResumeData): string[] {
  const out: string[] = [];
  const known = new Set(numbersIn(JSON.stringify(master)));
  const invented = [...new Set(numbersIn(letter))].filter((n) => !known.has(n) && !/^(19|20)\d{2}$/.test(n));
  if (invented.length) out.push(`It mentions figures that aren't in the profile (${invented.join(", ")}); only use real numbers.`);
  const words = letter.trim().split(/\s+/).length;
  if (words > 250) out.push(`It has ${words} words; the limit is 250.`);
  if (/\[[^\]]+\]/.test(letter)) out.push("It contains placeholders in square brackets.");
  return out;
}

function trimToWords(text: string, max: number) {
  const words = text.split(/(\s+)/);
  let n = 0;
  let out = "";
  for (const w of words) {
    if (/\S/.test(w)) n++;
    if (n > max) break;
    out += w;
  }
  return out.trim().replace(/[,;:]?$/, ".");
}

// ─────────────────────────── Rendering cache ───────────────────────────

export function resumeObjectKey(studentId: string, versionId: string, format: "pdf" | "docx") {
  return `students/${studentId}/resumes/${versionId}.${format}`;
}

export const MIME = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } as const;

/**
 * Render (or reuse) a version's PDF/DOCX and cache it to storage (pdfKey/docxKey).
 * Returns the key and a download file name. Rendering never changes content, so
 * locked versions can be rendered on demand.
 */
export async function ensureRendered(versionId: string, format: "pdf" | "docx", opts: { force?: boolean } = {}) {
  const v = await db.resumeVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      studentId: true,
      content: true,
      styleCode: true,
      templateCode: true,
      pdfKey: true,
      docxKey: true,
      createdAt: true,
      kind: true,
      student: { select: { userId: true, user: { select: { name: true } } } },
      applications: { select: { companyName: true, jobTitle: true, appliedAt: true }, orderBy: { createdAt: "asc" }, take: 1 },
      title: true,
    },
  });
  if (!v) throw new ResumeError("Resume version not found.");
  const style = await getStyleByCode(v.styleCode);
  const app = v.applications[0];
  const [titlePart, companyPart] = v.kind === "TAILORED" ? v.title.split(" – ") : [null, null];
  const filename = resumeFileName(
    { studentName: v.student.user.name, company: app?.companyName ?? companyPart, jobTitle: app?.jobTitle ?? titlePart, date: app?.appliedAt ?? v.createdAt, documentTitle: style.documentTitle },
    format,
  );
  const existing = format === "pdf" ? v.pdfKey : v.docxKey;
  if (existing && !opts.force) return { key: existing, filename, mime: MIME[format], studentId: v.studentId };

  const resume = ResumeJSON.parse(v.content);
  const docTitle = `${v.student.user.name} – ${style.documentTitle}`;
  let buffer: Buffer;
  if (format === "pdf") {
    const { renderResumePdf } = await import("@/resume/render-pdf");
    buffer = (await renderResumePdf({ resume, style, template: v.templateCode, photo: await loadPhoto(resume, style), title: docTitle })).buffer;
  } else {
    const { renderResumeDocx } = await import("@/resume/render-docx");
    buffer = await renderResumeDocx({ resume, style, template: v.templateCode, title: docTitle });
  }
  const key = resumeObjectKey(v.studentId, v.id, format);
  await storeGenerated({ key, buffer, mime: MIME[format], ownerUserId: v.student.userId, studentId: v.studentId, purpose: "resume", filename });
  await db.resumeVersion.update({ where: { id: v.id }, data: format === "pdf" ? { pdfKey: key } : { docxKey: key } });
  return { key, filename, mime: MIME[format], studentId: v.studentId, buffer };
}

async function loadPhoto(resume: ResumeData, style: RenderStyle) {
  if (!style.includePhoto || !resume.basics.photoKey) return null;
  try {
    return await readObject(resume.basics.photoKey);
  } catch {
    return null;
  }
}

/** Unsaved editor content → PNG pages for the live preview (no storage). */
export async function renderPreviewPages(user: Actor, input: { studentId: string; content: unknown; styleCode?: string; templateCode?: string }) {
  await assertCanAccessStudentResumes(user, input.studentId);
  const parsed = ResumeJSON.safeParse(input.content);
  if (!parsed.success) throw new ResumeError("The resume has invalid data and can't be previewed.");
  const ctx = await getStudentResumeContext(input.studentId);
  const style = input.styleCode ? await getStyleByCode(input.styleCode) : ctx.style;
  const { renderResumePdf } = await import("@/resume/render-pdf");
  const { buffer, pages } = await renderResumePdf({ resume: parsed.data, style, template: input.templateCode ?? ctx.templateCode });
  return { pdf: buffer, pages, images: await pdfToPngs(buffer, 1.6) };
}

/** Rasterise a PDF's pages (pdf.js + @napi-rs/canvas via pdf-parse). */
export async function pdfToPngs(pdf: Buffer, scale = 1.5, maxPages = 4): Promise<{ data: Buffer; width: number; height: number }[]> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(pdf) });
  try {
    const r = await parser.getScreenshot({ scale, first: maxPages, imageDataUrl: false });
    return r.pages.map((p) => ({ data: Buffer.from(p.data), width: p.width, height: p.height }));
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

// Re-exports for callers (onboarding UI, jobs).
export { emptyResume };
