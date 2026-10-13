import "server-only";
import { z } from "zod";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { assertEmployeeCanAccessStudent } from "@/server/auth/access";
import { ResumeJSON, allProfileSkills, type ResumeData } from "@/resume/schema";
import { AiNotConfiguredError, AiOutputError, aiConfigured, callTool } from "@/server/ai/client";
import { BulletRewriteOutput, JdAnalysis, SummaryRewriteOutput, type JdAnalysisData } from "@/server/ai/schemas";
import { bulletEditPrompt, summaryRewritePrompt, type BulletEditMode } from "@/server/ai/prompts/edits";
import { numbersIn, validateTailored } from "@/server/ai/validators";
import { ResumeError, enforceAiLimits, getStudentResumeContext } from "./resumes";

/**
 * AI editor assists (F4 employee speed): per-bullet Improve / Shorten / Match JD
 * and "Rewrite summary for this job". The model's output is accepted only when
 * code confirms it introduces nothing absent from the master profile:
 *  - the full resume (with the edit applied) passes `validateTailored`;
 *  - every skill the model reports using exists in the profile;
 *  - no JD skill/keyword that is missing from the profile appears in the text;
 *  - every number already appears in the original text or the master profile.
 * One automatic retry with the problem list; otherwise the suggestion is dropped.
 * The caller shows before/after and the employee accepts or rejects.
 */

type Actor = { id: string; role: Role };

export const BulletTarget = z.object({ kind: z.literal("bullet"), experienceId: z.string().min(1), bulletId: z.string().min(1) });
export const SummaryTarget = z.object({ kind: z.literal("summary") });
export const EditRequest = z.object({
  versionId: z.string().min(1).max(64),
  mode: z.enum(["improve", "shorten", "match", "summary"]),
  target: z.discriminatedUnion("kind", [BulletTarget, SummaryTarget]),
  /** The editor's current (possibly unsaved) content. */
  content: z.unknown(),
  jobTitle: z.string().max(200).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  jd: z.string().max(20_000).optional().nullable(),
});
export type EditRequestT = z.input<typeof EditRequest>;

export type EditSuggestion = { before: string; after: string; unchanged: boolean; keywordsUsed: string[] };

const key = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const containsTerm = (text: string, term: string) => new RegExp(`(^|[^a-z0-9+#])${esc(term.toLowerCase())}(?=$|[^a-z0-9+#])`, "i").test(text.toLowerCase());

function masterNumbers(master: ResumeData) {
  return new Set(numbersIn(JSON.stringify(master)));
}

/**
 * Code checks on a rewritten piece of text (bullet or summary). Returns a list of
 * problems (empty = accepted). `original` numbers are always allowed.
 */
export function textProblems(input: { text: string; original: string; master: ResumeData; skillsMentioned: string[]; analysis: JdAnalysisData | null }): string[] {
  const problems: string[] = [];
  const profile = new Set(allProfileSkills(input.master).map(key));
  for (const s of input.skillsMentioned) {
    if (s.trim() && !profile.has(key(s))) problems.push(`"${s.trim()}" isn't in the student's profile — remove it.`);
  }
  // JD hard skills the student doesn't have must not appear (the classic "invented skill").
  // Generic `keywords` (e.g. "dashboards", "stakeholder management") are legitimate wording and aren't scanned.
  if (input.analysis) {
    const jdTerms = [...new Set([...input.analysis.requiredSkills, ...input.analysis.niceToHaveSkills].map((t) => t.trim()).filter((t) => t.length >= 2))];
    for (const term of jdTerms) {
      if (profile.has(key(term))) continue;
      if (containsTerm(input.original, term)) continue; // was already there (employee wrote it)
      if (containsTerm(input.text, term)) problems.push(`"${term}" comes from the job description but isn't in the student's profile — remove it.`);
    }
  }
  const allowed = masterNumbers(input.master);
  for (const n of numbersIn(input.original)) allowed.add(n);
  for (const n of new Set(numbersIn(input.text))) {
    if (!allowed.has(n)) problems.push(`The number "${n}" doesn't appear in the original or the master profile — use only real figures.`);
  }
  if (/\[[^\]]+\]/.test(input.text)) problems.push("It contains placeholders in square brackets.");
  return [...new Set(problems)];
}

async function loadVersion(user: Actor, versionId: string) {
  const v = await db.resumeVersion.findUnique({ where: { id: versionId }, select: { id: true, studentId: true, kind: true, lockedAt: true, jdAnalysis: true } });
  if (!v) throw new ResumeError("Resume version not found.");
  await assertEmployeeCanAccessStudent(user, v.studentId);
  if (v.lockedAt) throw new ResumeError("This resume was already used in an application and can't be changed.");
  if (v.kind !== "TAILORED") throw new ResumeError("Only tailored resumes can be edited here.");
  return v;
}

/** One assist. Returns the suggestion (the client applies it on Accept) or throws a ResumeError. */
export async function suggestEdit(user: Actor, raw: EditRequestT): Promise<EditSuggestion> {
  const input = EditRequest.parse(raw);
  const v = await loadVersion(user, input.versionId);
  if (!aiConfigured()) throw new AiNotConfiguredError();
  const parsed = ResumeJSON.safeParse(input.content);
  if (!parsed.success) throw new ResumeError("The resume has invalid data; save your edits first.");
  const content = parsed.data;
  const ctx = await getStudentResumeContext(v.studentId);
  if (!ctx.master) throw new ResumeError("The master profile is missing.");
  const master = ctx.master;
  const analysisParsed = JdAnalysis.safeParse(v.jdAnalysis);
  const analysis = analysisParsed.success ? analysisParsed.data : null;
  await enforceAiLimits(user, v.studentId);

  if (input.target.kind === "summary") {
    const original = content.summary ?? "";
    const ask = async (previousProblems?: string[]) => {
      const p = summaryRewritePrompt({ master, resume: content, job: { title: input.jobTitle || "", company: input.company || "" }, analysis, jd: input.jd ?? "", spelling: ctx.style.spelling, previousProblems });
      const { data } = await callTool({ task: "rewrite_summary", tier: "fast", schema: SummaryRewriteOutput, toolName: "save_summary", toolDescription: "Save the rewritten summary.", system: p.system, messages: [{ role: "user", content: p.user }], maxTokens: 800, temperature: 0.3, userId: user.id, studentId: v.studentId });
      return data;
    };
    const check = (summary: string, skills: string[]) => {
      const problems = textProblems({ text: summary, original, master, skillsMentioned: skills, analysis });
      const full = validateTailored(master, { ...content, summary });
      return [...problems, ...full.errors.map((e) => e.message)];
    };
    let out = await askSafely(ask);
    let problems = out ? check(out.summary, out.skillsMentioned) : ["The AI didn't return a usable summary."];
    if (problems.length) {
      out = await askSafely(() => ask(problems));
      problems = out ? check(out.summary, out.skillsMentioned) : ["The AI didn't return a usable summary."];
    }
    if (!out || problems.length) throw new ResumeError(`The suggestion was discarded because it added things that aren't in the profile: ${problems.slice(0, 3).join(" ")}`);
    const after = out.summary.trim();
    return { before: original, after, unchanged: key(after) === key(original), keywordsUsed: [] };
  }

  const { experienceId, bulletId } = input.target;
  const exp = content.experience.find((e) => e.id === experienceId);
  const bullet = exp?.bullets.find((b) => b.id === bulletId);
  if (!exp || !bullet) throw new ResumeError("That bullet no longer exists.");
  const masterExp = master.experience.find((e) => e.id === experienceId);
  if (!masterExp) throw new ResumeError("That role isn't in the master profile.");
  const original = bullet.text;
  if (!original.trim()) throw new ResumeError("Write something in the bullet first.");
  const mode = (input.mode === "summary" ? "improve" : input.mode) as BulletEditMode;
  const role = { company: masterExp.company, title: masterExp.title, bullets: masterExp.bullets.map((b) => b.text), technologies: masterExp.technologies ?? [] };
  const ask = async (previousProblems?: string[]) => {
    const p = bulletEditPrompt({ mode, master, role, bullet: original, analysis, jobTitle: input.jobTitle, spelling: ctx.style.spelling, previousProblems });
    const { data } = await callTool({ task: "improve_bullet", tier: "fast", schema: BulletRewriteOutput, toolName: "save_bullet", toolDescription: "Save the rewritten bullet.", system: p.system, messages: [{ role: "user", content: p.user }], maxTokens: 500, temperature: 0.3, userId: user.id, studentId: v.studentId });
    return data;
  };
  const check = (text: string, skills: string[]) => {
    const problems = textProblems({ text, original, master, skillsMentioned: skills, analysis });
    const candidate: ResumeData = { ...content, experience: content.experience.map((e) => (e.id === experienceId ? { ...e, bullets: e.bullets.map((b) => (b.id === bulletId ? { ...b, text } : b)) } : e)) };
    const full = validateTailored(master, candidate);
    if (mode === "shorten" && text.trim().split(/\s+/).length > original.trim().split(/\s+/).length) problems.push("It is longer than the original.");
    return [...problems, ...full.errors.map((e) => e.message)];
  };
  let out = await askSafely(ask);
  let problems = out ? check(out.text, out.skillsMentioned) : ["The AI didn't return a usable bullet."];
  if (problems.length) {
    out = await askSafely(() => ask(problems));
    problems = out ? check(out.text, out.skillsMentioned) : ["The AI didn't return a usable bullet."];
  }
  if (!out || problems.length) throw new ResumeError(`The suggestion was discarded because it added things that aren't in the profile: ${problems.slice(0, 3).join(" ")}`);
  const after = out.text.trim().replace(/^[-•*]\s*/, "");
  return { before: original, after, unchanged: key(after) === key(original), keywordsUsed: out.keywordsUsed.filter((k) => containsTerm(after, k)) };
}

async function askSafely<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AiOutputError) return null;
    throw e;
  }
}
