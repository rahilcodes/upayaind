import { z } from "zod";
import { ResumeJSON } from "@/resume/schema";

/** JD analysis (SPEC F4 step 1). Cached by sha256(jd) for 30 days. */
export const JdAnalysis = z.object({
  requiredSkills: z.array(z.string()).describe("Hard skills/technologies the JD says are required"),
  niceToHaveSkills: z.array(z.string()).describe("Skills listed as preferred / nice to have / a plus"),
  keywords: z.array(z.string()).describe("Other ATS keywords and short phrases (domain terms, methodologies, certifications) — 1 to 3 words each"),
  seniority: z.string().describe("Intern | Entry | Mid | Senior | Lead | Manager | Director | Executive"),
  responsibilitiesSummary: z.string().describe("2–3 sentences summarising the role's responsibilities"),
  titleKeywords: z.array(z.string()).default([]).describe("Core words of the job title, e.g. ['data', 'analyst']"),
});
export type JdAnalysisData = z.infer<typeof JdAnalysis>;

/** The tailoring tool returns a full resume JSON (same schema as the master profile). */
export const TailorOutput = ResumeJSON;

export const CoverLetterOutput = z.object({
  coverLetter: z.string().min(50).describe("Plain-text cover letter, ≤ 250 words, paragraphs separated by blank lines, no placeholders"),
});

/**
 * Lenient shape for parsing an uploaded resume: real resumes often miss fields
 * (no phone, no dates). We normalise into ResumeJSON afterwards.
 */
export const ParsedResume = z.object({
  basics: z.object({
    name: z.string().default(""),
    headline: z.string().optional(),
    email: z.string().default(""),
    phone: z.string().default(""),
    location: z.object({ city: z.string().default(""), region: z.string().optional(), country: z.string().default("") }).default({ city: "", country: "" }),
    links: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
    workAuthorization: z.string().optional(),
  }),
  summary: z.string().optional(),
  skills: z.array(z.object({ group: z.string(), items: z.array(z.string()) })).default([]),
  experience: z
    .array(
      z.object({
        company: z.string(),
        title: z.string(),
        location: z.string().optional(),
        startDate: z.string().describe("YYYY-MM; use -01 when only the year is known"),
        endDate: z.string().nullable().describe("YYYY-MM, or null if current"),
        bullets: z.array(z.string()).default([]),
        technologies: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  projects: z.array(z.object({ name: z.string(), description: z.string().default(""), bullets: z.array(z.string()).default([]), link: z.string().optional() })).default([]),
  education: z
    .array(z.object({ institution: z.string(), degree: z.string(), field: z.string().optional(), startDate: z.string().optional(), endDate: z.string().optional(), grade: z.string().optional() }))
    .default([]),
  certifications: z.array(z.object({ name: z.string(), issuer: z.string().optional(), date: z.string().optional() })).default([]),
  awards: z.array(z.string()).default([]),
  languages: z.array(z.object({ name: z.string(), level: z.string() })).default([]),
});
export type ParsedResumeData = z.infer<typeof ParsedResume>;
