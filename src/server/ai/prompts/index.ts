import type { ResumeData } from "@/resume/schema";
import type { JdAnalysisData } from "../schemas";
import { masterForPrompt, trimJdForPrompt } from "../tailor-patch";
import { DATA_NOTE, TRUTHFULNESS_RULES, fenced, spellingRule, styleRules, type MarketForPrompt, type StyleForPrompt } from "./shared";

export type { StyleForPrompt, MarketForPrompt } from "./shared";
export { TRUTHFULNESS_RULES } from "./shared";

export type Prompt = { system: string; user: string };

/** Uploaded resume text → master profile JSON (F3 step 1). */
export function parseResumePrompt(input: { text: string; marketName?: string }): Prompt {
  return {
    system: `You convert resumes into structured JSON for a job-application service. Output ONLY via the provided tool.
Rules:
- Copy facts exactly as written: company names, job titles, dates, degrees, institutions, certifications, metrics. Never invent or embellish anything.
- Dates: "YYYY-MM". If only a year is known use "YYYY-01". Current roles have endDate null.
- Split each role's bullet points into "bullets" (one achievement per item, verbatim or lightly cleaned of symbols).
- "technologies" per role: only tools/technologies explicitly mentioned for that role.
- "skills": group the skills section as written (e.g. "Languages", "Tools"); if ungrouped use one group "Skills".
- Links: full URLs (add https:// when missing). Leave fields empty rather than guessing.
${input.marketName ? `- The student is applying in the ${input.marketName} market.` : ""}
${DATA_NOTE}`,
    user: `Parse this resume into the tool's JSON.\n\n${fenced("resume_text", input.text.slice(0, 60_000))}`,
  };
}

/** JD → structured analysis (fast model, cached). */
export function analyzeJdPrompt(input: { jd: string; title?: string; company?: string }): Prompt {
  return {
    system: `You are an ATS (applicant tracking system) expert. Extract structured requirements from a job description. Output ONLY via the provided tool.
- requiredSkills: concrete hard skills/technologies/tools that are required (short canonical names, e.g. "Python", "SQL", "AWS").
- niceToHaveSkills: those marked preferred / nice to have / a plus / bonus.
- keywords: other ATS terms a recruiter would search for (domain terms, methodologies, certifications, soft-skill phrases), 1–3 words each, max 25, no duplicates of skills.
- titleKeywords: the meaningful words of the job title (lowercase, no seniority words like senior/junior/ii).
- Keep the JD's own wording. Do not invent requirements.
${DATA_NOTE}`,
    user: `JOB: ${input.title ?? "(title not given)"}${input.company ? ` at ${input.company}` : ""}\n\n${fenced("jd", trimJdForPrompt(input.jd, 12_000))}`,
  };
}

/**
 * Master profile + JD → tailoring patch (SPEC §9.4, D-156). The model sees a
 * compact profile and returns only what it may change; the server merges it
 * (`applyTailorPatch`). The stable part (system prompt, tool, profile) comes
 * first so the provider's prompt cache hits across jobs for the same student.
 */
export function tailorResumePrompt(input: {
  style: StyleForPrompt;
  market: MarketForPrompt;
  master: ResumeData;
  job: { title: string; company: string; location?: string | null };
  analysis: JdAnalysisData;
  jd: string;
  previousErrors?: string[];
}): Prompt {
  const retry = input.previousErrors?.length
    ? `\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED by the truthfulness validator. Fix every one of these problems:\n${input.previousErrors.map((e) => `- ${e}`).join("\n")}`
    : "";
  return {
    system: `You are an expert ${input.style.name} writer for the ${input.market.name} job market. Output ONLY via the provided tool.
TRUTHFULNESS RULES (hard rules — breaking any of them makes the output unusable):
1. Never invent employers, job titles, dates, degrees, certifications, metrics or skills. Everything must come from MASTER_PROFILE; numbers in bullets must already appear there.
2. You MAY reorder and rephrase bullets, merge or trim them, choose which experience to emphasise, rewrite the summary and headline, and surface every profile skill the job asks for — in the JOB DESCRIPTION'S OWN WORDING ("Microsoft Excel" if the JD says so and the profile says "Excel"; "PostgreSQL (SQL)" when the profile has PostgreSQL and the JD asks for SQL). A profile skill may be listed under the JD's name with the profile's name in brackets.
3. Skills (groups and technologies): only skills that exist in MASTER_PROFILE, or the same thing under the JD's name. NEVER add a JD skill the student lacks — the specialist adds those after the student confirms. Methodologies, domain terms and ways of working from the JD (Agile, stakeholder management, root-cause analysis…) may appear in the summary and bullets wherever the experience genuinely shows them.
4. Keep every role (use its id from MASTER_PROFILE). A role you leave out is dropped — only allowed when that creates no gap of more than 6 months; otherwise keep it with one bullet.
Contact details, dates, employers, titles, education and certifications are filled in from the profile by the server: do not output them.
${styleRules(input.style)}
ATS MAXIMISATION (within the rules above):
- Go through EVERY item of JD_ANALYSIS.requiredSkills, niceToHaveSkills and keywords. Each one the student genuinely has or has done must appear at least once, in the JD's exact phrase: in a skills group, a bullet or the summary.
- First skills group: "Key skills" — the JD-matching skills first, in the JD's wording, then the student's other relevant skills.
- Headline: the job title (or its closest truthful variant) when the experience matches the role; otherwise the student's own title.
- Summary: 2–3 sentences that read like the role's own description, built only from real experience, naming the top required skills and the domain.
- Bullets: strong, specific, action-verb first; where a bullet describes work that used a JD skill or keyword, name it explicitly in the JD's wording. Most relevant bullets and roles first.
- Freshers and junior profiles: treat academic projects, internships, coursework, certifications and training as experience — frame each one in the JD's language (the problem, the tools, the outcome) so the resume reads like the role's own description. Don't leave project sections thin when the JD is demanding.
- Reframe, don't inflate: describe what the student actually did using the JD's terminology and priorities; never add responsibilities, employers, titles, years or tools they didn't have.
- Do not stuff: each term appears where it is true, in natural sentences.
${DATA_NOTE}`,
    user: `${fenced("master_profile", JSON.stringify(masterForPrompt(input.master)))}

JOB: ${input.job.title} at ${input.job.company}${input.job.location ? `, ${input.job.location}` : ""}.
JD_ANALYSIS: ${JSON.stringify(input.analysis)}
${fenced("jd", trimJdForPrompt(input.jd))}

Task: return the tailoring patch (headline, summary, skills, bullets per role) that maximises keyword coverage of JD_ANALYSIS truthfully — every JD term the student can honestly claim must appear, in the JD's wording.${retry}`,
  };
}

/** Cover letter (≤ 250 words, same truthfulness rules). */
export function coverLetterPrompt(input: {
  style: StyleForPrompt;
  market: MarketForPrompt;
  resume: ResumeData;
  job: { title: string; company: string; location?: string | null };
  analysis: JdAnalysisData | null;
  jd: string;
}): Prompt {
  return {
    system: `You write concise, specific cover letters for the ${input.market.name} job market. Output ONLY via the provided tool.
${TRUTHFULNESS_RULES}
- At most 250 words, 3–4 short paragraphs, plain text (no markdown), no address block, no placeholders like [Hiring Manager].
- Open with "Dear Hiring Team," unless a name appears in the JD. Close with "Sincerely," / "Kind regards," and the candidate's name (${input.resume.basics.name}).
- Mention only experience, skills and achievements present in RESUME.
- ${spellingRule(input.style.spelling)}
${DATA_NOTE}`,
    user: `${fenced("master_profile", JSON.stringify(masterForPrompt(input.resume)))}

JOB: ${input.job.title} at ${input.job.company}${input.job.location ? `, ${input.job.location}` : ""}.
${input.analysis ? `JD_ANALYSIS: ${JSON.stringify(input.analysis)}\n` : ""}${fenced("jd", trimJdForPrompt(input.jd, 5000))}

Write the cover letter.`,
  };
}
