import type { ResumeData } from "@/resume/schema";
import { allProfileSkills } from "@/resume/schema";
import type { JdAnalysisData } from "../schemas";
import { DATA_NOTE, TRUTHFULNESS_RULES, fenced, spellingRule } from "./shared";
import type { Prompt } from "./index";

/**
 * Editor assists (F4 employee speed): rewrite ONE bullet or the summary.
 * Same truthfulness rules as tailoring (SPEC §9.4); the result is checked by
 * code afterwards (skills, numbers, JD terms absent from the profile).
 */

export type BulletEditMode = "improve" | "shorten" | "match";

const MODE_TASK: Record<BulletEditMode, string> = {
  improve:
    "IMPROVE: make the bullet stronger and more specific. Start with a strong action verb, keep the exact meaning, and keep it to one sentence of at most 30 words. Quantify ONLY with figures that already appear in the original bullet or elsewhere in MASTER_PROFILE for the same role — never estimate or invent a number.",
  shorten: "SHORTEN: cut the bullet to at most 16 words while keeping its meaning, every figure and every named tool exactly as in the original. Remove filler, not facts.",
  match:
    "MATCH JD: rephrase the bullet so that JD keywords the bullet ALREADY supports appear verbatim (e.g. say \"SQL\" when the bullet talks about queries and SQL is in the profile). Only use keywords from JD_KEYWORDS that this bullet's facts genuinely demonstrate; never add a tool, method or responsibility the original doesn't contain. If nothing in the bullet matches, return it unchanged.",
};

export function bulletEditPrompt(input: {
  mode: BulletEditMode;
  master: ResumeData;
  role: { company: string; title: string; bullets: string[]; technologies: string[] };
  bullet: string;
  analysis: JdAnalysisData | null;
  jobTitle?: string | null;
  spelling: string;
  previousProblems?: string[];
}): Prompt {
  const profileSkills = allProfileSkills(input.master);
  const jdKeywords = input.analysis ? [...input.analysis.requiredSkills, ...input.analysis.niceToHaveSkills, ...input.analysis.keywords] : [];
  const retry = input.previousProblems?.length ? `\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED by the truthfulness validator. Fix every one of these problems:\n${input.previousProblems.map((e) => `- ${e}`).join("\n")}` : "";
  return {
    system: `You edit single resume bullet points for a job-application service. Output ONLY via the provided tool.
${TRUTHFULNESS_RULES}
Additional rules for this task:
- Edit ONLY the bullet given. Never mention employers, titles, dates, degrees or certifications that are not in MASTER_PROFILE.
- Every tool, technology or named skill in your text must be in PROFILE_SKILLS (case-insensitive). List each one you used in skillsMentioned.
- Every number in your text must already appear in the original bullet or in MASTER_PROFILE. No new percentages, amounts, counts or time spans.
- Plain text, one bullet, no leading dash or bullet symbol, no markdown.
- ${spellingRule(input.spelling)}
${DATA_NOTE}`,
    user: `${fenced("master_profile", JSON.stringify(input.master))}

PROFILE_SKILLS: ${JSON.stringify(profileSkills)}
ROLE: ${input.role.title} at ${input.role.company} (technologies: ${input.role.technologies.join(", ") || "none listed"})
OTHER BULLETS IN THIS ROLE: ${JSON.stringify(input.role.bullets)}
${input.jobTitle ? `TARGET JOB: ${input.jobTitle}\n` : ""}${jdKeywords.length ? `JD_KEYWORDS: ${JSON.stringify(jdKeywords)}\n` : ""}
ORIGINAL BULLET: ${JSON.stringify(input.bullet)}

TASK — ${MODE_TASK[input.mode]}${retry}`,
  };
}

export function summaryRewritePrompt(input: {
  master: ResumeData;
  resume: ResumeData;
  job: { title: string; company: string };
  analysis: JdAnalysisData | null;
  jd: string;
  spelling: string;
  previousProblems?: string[];
}): Prompt {
  const profileSkills = allProfileSkills(input.master);
  const retry = input.previousProblems?.length ? `\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED by the truthfulness validator. Fix every one of these problems:\n${input.previousProblems.map((e) => `- ${e}`).join("\n")}` : "";
  return {
    system: `You write resume summaries for a job-application service. Output ONLY via the provided tool.
${TRUTHFULNESS_RULES}
Additional rules for this task:
- Rewrite ONLY the professional summary for the target job: 2–4 sentences, at most 80 words, third person implied (no "I"), plain text.
- Mention only experience, achievements and skills present in MASTER_PROFILE / RESUME. Every tool or named skill must be in PROFILE_SKILLS; list each one in skillsMentioned.
- Years of experience and any number must already appear in MASTER_PROFILE. Never invent figures.
- Lead with the candidate's actual role family and the JD's most relevant strengths that the profile supports.
- ${spellingRule(input.spelling)}
${DATA_NOTE}`,
    user: `${fenced("master_profile", JSON.stringify(input.master))}

PROFILE_SKILLS: ${JSON.stringify(profileSkills)}
CURRENT SUMMARY: ${JSON.stringify(input.resume.summary ?? "")}
JOB: ${input.job.title} at ${input.job.company}
${input.analysis ? `JD_ANALYSIS: ${JSON.stringify(input.analysis)}\n` : ""}${input.jd ? fenced("jd", input.jd.slice(0, 12_000)) : ""}

Rewrite the summary for this job.${retry}`,
  };
}
