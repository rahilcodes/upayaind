import type { ApplicationStatus, EmploymentType, JobSource, WorkMode } from "@/generated/prisma/enums";
import type { ResumeData } from "@/resume/schema";
import type { AtsBreakdown } from "@/server/ai/ats-score";
import type { JdAnalysisData } from "@/server/ai/schemas";
import type { ValidationResult } from "@/server/ai/validators";

export type JobState = {
  jobUrl: string;
  companyName: string;
  /** From the company autocomplete (optional; derived from the URL otherwise). */
  companyDomain: string;
  jobTitle: string;
  location: string;
  workMode: WorkMode | "";
  employmentType: EmploymentType | "";
  source: JobSource;
  jd: string;
};

export const EMPTY_JOB: JobState = { jobUrl: "", companyName: "", companyDomain: "", jobTitle: "", location: "", workMode: "", employmentType: "FULL_TIME", source: "LINKEDIN", jd: "" };

/** Last-used defaults per employee (D-102), applied when a new form opens. */
export type WorkspaceDefaults = { source?: JobSource; workMode?: WorkMode | null; employmentType?: EmploymentType | null; location?: string | null };

export function jobWithDefaults(d: WorkspaceDefaults | null | undefined): JobState {
  if (!d) return EMPTY_JOB;
  return { ...EMPTY_JOB, source: d.source ?? EMPTY_JOB.source, workMode: d.workMode ?? "", employmentType: d.employmentType === null ? "" : (d.employmentType ?? EMPTY_JOB.employmentType), location: d.location ?? "" };
}

export type CompanySuggestion = { name: string; domain: string | null; count: number };

export type DuplicateState = {
  block: null | { code: "same_url" | "avoid_company"; message: string; applicationId?: string };
  warnings: { code: "similar"; message: string; applicationId: string; companyName: string; jobTitle: string; appliedAt: string | null; similarity: number }[];
  normalizedUrl: string | null;
};

export type GenStep = "analysing" | "tailoring" | "validating" | "scoring" | "rendering" | "done";
export const GEN_STEPS: Exclude<GenStep, "done">[] = ["analysing", "tailoring", "validating", "scoring", "rendering"];

export type TailorState = {
  versionId: string;
  content: ResumeData;
  analysis: JdAnalysisData & { method?: "ai" | "heuristic" };
  serverValidation: ValidationResult & { attempts: number; aiUnavailable?: boolean };
  base: AtsBreakdown;
  pages: number;
  aiUnavailable: boolean;
  locked: boolean;
  applicationId?: string;
};

export type StyleInfo = {
  code: string;
  styleName: string;
  documentTitle: string;
  pageSize: "LETTER" | "A4";
  maxPages: number;
  summaryLabel: string;
  spelling: string;
  sectionOrder: string[];
  dateFormat: string;
  includePhoto: boolean;
  includeDob: boolean;
  includeNationality: boolean;
  includeFullAddress: boolean;
};

export type RecentApp = { id: string; companyName: string; jobTitle: string; status: ApplicationStatus; appliedAt: string; resumeVersionId: string | null };

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
