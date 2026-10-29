import type { ResumeData } from "@/resume/schema";
import type { JdAnalysisData } from "../schemas";
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
    user: `JOB: ${input.title ?? "(title not given)"}${input.company ? ` at ${input.company}` : ""}\n\n${fenced("jd", input.jd)}`,
  };
}

/** Master profile + JD → tailored resume (SPEC §9.4 skeleton). */
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
${TRUTHFULNESS_RULES}
${styleRules(input.style)}
Write strong, specific bullets that start with action verbs. Put the most relevant experience bullets and skills first. Keep ids of experience entries and bullets from MASTER_PROFILE (new bullet ids may be "<expId>_t1", "<expId>_t2"...).
Set meta.sectionOrder to the section order above.
ATS MAXIMISATION (do all of these, within the truthfulness rules):
- Go through EVERY item of JD_ANALYSIS.requiredSkills, niceToHaveSkills and keywords. For each one the student genuinely has or has done, make sure the exact JD phrase appears in the resume: in the skills section, in a bullet, or in the summary. Aim for every matching term to appear at least once.
- First skills group: name it "Key skills" and list the JD-matching skills first, in the JD's wording, followed by the student's other relevant skills.
- Headline: use the job title (or the closest truthful variant of it) when the student's experience matches the role; otherwise the student's own title.
- Summary: 2–3 sentences that read like the role's own description, built only from the student's real experience, naming the top required skills and the domain.
- Bullets: where a bullet describes work that used a JD skill or keyword, rewrite it to name that skill/keyword explicitly (same wording as the JD).
- Do not stuff: each term should appear where it is true, in natural sentences. Never list a skill the student lacks.
${DATA_NOTE}`,
    user: `${fenced("master_profile", JSON.stringify(input.master))}

JOB: ${input.job.title} at ${input.job.company}${input.job.location ? `, ${input.job.location}` : ""}.
JD_ANALYSIS: ${JSON.stringify(input.analysis)}
${fenced("jd", input.jd)}

Task: produce a tailored resume JSON that maximises keyword coverage of JD_ANALYSIS truthfully — every JD term the student can honestly claim must appear, in the JD's wording.${retry}`,
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
    user: `${fenced("master_profile", JSON.stringify(input.resume))}

JOB: ${input.job.title} at ${input.job.company}${input.job.location ? `, ${input.job.location}` : ""}.
${input.analysis ? `JD_ANALYSIS: ${JSON.stringify(input.analysis)}\n` : ""}${fenced("jd", input.jd)}

Write the cover letter.`,
  };
}
