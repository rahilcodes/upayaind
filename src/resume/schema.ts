import { z } from "zod";

/**
 * Resume JSON (SPEC §9.2). Used for the master profile AND every resume
 * version (base + tailored). Dates are ISO "yyyy-mm"; `endDate: null` = present.
 */

const yyyymm = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");

export const ResumeBasics = z.object({
  name: z.string().min(1),
  headline: z.string().optional(),
  email: z.string().email(),
  phone: z.string(),
  location: z.object({ city: z.string(), region: z.string().optional(), country: z.string() }),
  links: z.array(z.object({ label: z.string(), url: z.string().url() })).default([]),
  photoKey: z.string().optional(),
  dateOfBirth: z.string().optional(),
  nationality: z.string().optional(),
  workAuthorization: z.string().optional(),
});

export const ResumeExperience = z.object({
  id: z.string(),
  company: z.string(),
  title: z.string(),
  location: z.string().optional(),
  startDate: yyyymm,
  endDate: yyyymm.nullable(),
  bullets: z.array(z.object({ id: z.string(), text: z.string() })),
  technologies: z.array(z.string()).default([]),
});

export const ResumeProject = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  bullets: z.array(z.string()),
  link: z.string().optional(),
});

export const ResumeEducation = z.object({
  id: z.string(),
  institution: z.string(),
  degree: z.string(),
  field: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  grade: z.string().optional(),
});

export const ResumeJSON = z.object({
  basics: ResumeBasics,
  summary: z.string().max(800).optional(),
  skills: z.array(z.object({ group: z.string(), items: z.array(z.string()) })),
  experience: z.array(ResumeExperience),
  projects: z.array(ResumeProject).default([]),
  education: z.array(ResumeEducation),
  certifications: z.array(z.object({ name: z.string(), issuer: z.string().optional(), date: z.string().optional() })).default([]),
  awards: z.array(z.string()).default([]),
  languages: z.array(z.object({ name: z.string(), level: z.string() })).default([]),
  meta: z
    .object({ sectionOrder: z.array(z.string()).optional(), hiddenSections: z.array(z.string()).default([]) })
    .default({ hiddenSections: [] }),
});

export type ResumeData = z.infer<typeof ResumeJSON>;
export type ResumeInput = z.input<typeof ResumeJSON>;
export type ResumeExperienceData = z.infer<typeof ResumeExperience>;

export const SECTION_KEYS = ["summary", "skills", "experience", "projects", "education", "certifications", "awards", "languages"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

/** All skills in a profile: skill groups + experience technologies (truthfulness source). */
export function allProfileSkills(r: Pick<ResumeData, "skills" | "experience">): string[] {
  const set = new Map<string, string>();
  for (const g of r.skills) for (const s of g.items) set.set(s.trim().toLowerCase(), s.trim());
  for (const e of r.experience) for (const s of e.technologies ?? []) set.set(s.trim().toLowerCase(), s.trim());
  return [...set.values()];
}

/** A tiny but valid profile, used as a starting point when nothing was parsed. */
export function emptyResume(basics: { name: string; email: string; phone?: string | null; country?: string }): ResumeData {
  return {
    basics: {
      name: basics.name,
      email: basics.email,
      phone: basics.phone ?? "",
      location: { city: "", country: basics.country ?? "" },
      links: [],
    },
    summary: "",
    skills: [],
    experience: [],
    projects: [],
    education: [],
    certifications: [],
    awards: [],
    languages: [],
    meta: { hiddenSections: [] },
  };
}
