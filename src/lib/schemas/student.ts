import { z } from "zod";

/**
 * Shared (client + server) schemas for the student portal: onboarding job
 * preferences (SPEC F3 step 2), links (step 4), credential vault entries
 * (step 3, §10), personal info and notification preferences.
 */

export const SENIORITY_LEVELS = ["Intern", "Entry", "Mid", "Senior", "Lead", "Manager", "Director", "Executive"] as const;
export const WORK_MODE_VALUES = ["ONSITE", "HYBRID", "REMOTE"] as const;
export const EMPLOYMENT_TYPE_VALUES = ["FULL_TIME", "CONTRACT", "INTERNSHIP", "PART_TIME", "TEMPORARY"] as const;

/** US work authorization options (SPEC F3). Other markets use a free-text value. */
export const US_WORK_AUTH = ["Citizen", "Green Card", "H1B", "H4 EAD", "OPT", "STEM OPT", "CPT", "Needs sponsorship"] as const;
/** Options that imply the student needs (now or later) employer sponsorship. */
export const SPONSORSHIP_AUTH = new Set<string>(["H1B", "OPT", "STEM OPT", "CPT", "Needs sponsorship"]);

export const NOTICE_PERIODS = ["Immediately", "1 week", "2 weeks", "1 month", "2 months", "3 months"] as const;

export const CREDENTIAL_KINDS = ["EMAIL", "LINKEDIN", "INDEED", "DICE", "GLASSDOOR", "ZIPRECRUITER", "HANDSHAKE", "OTHER"] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

/** Default login pages per portal (pre-filled in the form, editable). */
export const CREDENTIAL_LOGIN_URLS: Partial<Record<CredentialKind, string>> = {
  LINKEDIN: "https://www.linkedin.com/login",
  INDEED: "https://secure.indeed.com/auth",
  DICE: "https://www.dice.com/dashboard/login",
  GLASSDOOR: "https://www.glassdoor.com/profile/login_input.htm",
  ZIPRECRUITER: "https://www.ziprecruiter.com/login",
  HANDSHAKE: "https://app.joinhandshake.com/login",
};

const trimmedList = (max: number, itemMax = 120) =>
  z
    .array(z.string().trim().max(itemMax))
    .max(max)
    .transform((a) => [...new Map(a.filter(Boolean).map((v) => [v.toLowerCase(), v])).values()]);

export const preferencesSchema = z.object({
  targetTitles: trimmedList(5, 100).refine((a) => a.length >= 1, "Add at least one target job title."),
  seniority: z.enum(SENIORITY_LEVELS, { error: "Pick your seniority." }),
  industries: trimmedList(10),
  locations: trimmedList(10),
  remoteOk: z.boolean(),
  workModes: z.array(z.enum(WORK_MODE_VALUES)).min(1, "Pick at least one work mode."),
  employmentTypes: z.array(z.enum(EMPLOYMENT_TYPE_VALUES)).min(1, "Pick at least one employment type."),
  minSalary: z
    .union([z.number(), z.string()])
    .optional()
    .nullable()
    .transform((v) => (v === "" || v === null || v === undefined ? null : Number(v)))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100_000_000), "Enter a valid amount."),
  salaryCurrency: z.string().trim().length(3).toUpperCase().optional().nullable(),
  workAuthorization: z.string().trim().min(1, "Tell us your work authorization.").max(80),
  willingToRelocate: z.boolean(),
  noticePeriod: z.string().trim().max(40).optional().nullable(),
  avoidCompanies: trimmedList(50),
  targetCompanies: trimmedList(50),
});
export type PreferencesInput = z.input<typeof preferencesSchema>;

const optionalUrl = (host?: RegExp, message = "Enter a valid link.") =>
  z
    .string()
    .trim()
    .max(300)
    .optional()
    .nullable()
    .transform((v) => (v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : null))
    .refine((v) => {
      if (!v) return true;
      try {
        const u = new URL(v);
        return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".") && (!host || host.test(u.hostname));
      } catch {
        return false;
      }
    }, message);

export const linksSchema = z.object({
  linkedinUrl: optionalUrl(/(^|\.)linkedin\.com$/i, "Enter your LinkedIn profile link (linkedin.com/in/…)."),
  githubUrl: optionalUrl(/(^|\.)github\.com$/i, "Enter your GitHub profile link (github.com/…)."),
  portfolioUrl: optionalUrl(),
});
export type LinksInput = z.input<typeof linksSchema>;

export const credentialSchema = z.object({
  kind: z.enum(CREDENTIAL_KINDS),
  label: z.string().trim().min(1, "Give this login a name.").max(80),
  loginUrl: optionalUrl(),
  username: z.string().trim().min(1, "Enter the username or email.").max(254),
  password: z.string().min(1, "Enter the password.").max(256),
  notes: z.string().trim().max(1000).optional().nullable(),
});
export type CredentialInput = z.input<typeof credentialSchema>;

/** Update: password/notes optional (blank = keep current). */
export const credentialUpdateSchema = credentialSchema.extend({
  password: z.string().max(256).optional().nullable(),
  keepNotes: z.boolean().default(false),
});
export type CredentialUpdateInput = z.input<typeof credentialUpdateSchema>;

export function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const personalSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(120),
  phone: z.string().trim().min(5, "Enter a phone number.").max(32),
  timezone: z.string().trim().refine(isValidTimezone, "Pick a valid time zone."),
});
export type PersonalInput = z.input<typeof personalSchema>;

export const changePasswordSchema = z
  .object({
    current: z.string().max(256).optional().default(""),
    password: z.string().min(10, "Use at least 10 characters.").max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match." });

/** Notification types a student may switch off by email (mandatory ones are always on). */
export const STUDENT_EMAIL_PREFS = [
  "daily_digest",
  "weekly_report",
  "status_interview",
  "status_offer",
  "new_message",
  "assigned_student",
  "reassigned_student",
  "cover_student",
  "mock_interview_booked",
  "mock_session_scheduled",
  "mock_session_cancelled",
  "coach_assigned",
  "testimonial_request",
] as const;
export const STUDENT_MANDATORY_EMAILS = ["payment_succeeded", "payment_failed", "renewal_reminder", "credential_access_digest"] as const;

export const ONBOARDING_STEPS = ["resume", "preferences", "vault", "links", "review"] as const;
export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number];
