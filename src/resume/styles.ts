import { SECTION_KEYS, type ResumeData, type SectionKey } from "./schema";
import { slugify } from "@/lib/utils";

/**
 * Isomorphic helpers shared by the PDF and DOCX renderers and the editor:
 * market style config, section order, headings, dates, file names.
 */

export type RenderStyle = {
  code: string;
  documentTitle: string; // "Resume" | "CV" | "Lebenslauf / CV"
  pageSize: "LETTER" | "A4";
  maxPages: number;
  dateFormat: string; // "MMM yyyy" | "MM/yyyy"
  spelling: string; // "en-US" | "en-GB" …
  includePhoto: boolean;
  includeDob: boolean;
  includeNationality: boolean;
  includeFullAddress: boolean;
  summaryLabel: string; // "Summary" | "Personal Statement" …
  sectionOrder: string[];
};

export const TEMPLATE_CODES = ["classic", "modern", "compact"] as const;
export type TemplateCode = (typeof TEMPLATE_CODES)[number];
export const asTemplate = (v: string | null | undefined): TemplateCode => (TEMPLATE_CODES.includes(v as TemplateCode) ? (v as TemplateCode) : "classic");

/** Used when a style row can't be found (should not happen with seeded data). */
export const FALLBACK_STYLE: RenderStyle = {
  code: "US_RESUME",
  documentTitle: "Resume",
  pageSize: "LETTER",
  maxPages: 1,
  dateFormat: "MMM yyyy",
  spelling: "en-US",
  includePhoto: false,
  includeDob: false,
  includeNationality: false,
  includeFullAddress: false,
  summaryLabel: "Summary",
  sectionOrder: ["summary", "skills", "experience", "projects", "education", "certifications"],
};

export function toRenderStyle(s: Omit<RenderStyle, "pageSize"> & { pageSize: string }): RenderStyle {
  return { ...s, pageSize: s.pageSize.toUpperCase() === "A4" ? "A4" : "LETTER" };
}

const isBritish = (spelling: string) => !/^en-US$/i.test(spelling) && !/^en-CA$/i.test(spelling);

/** Section headings. The summary label comes from the style; others follow the market's conventions. */
export function sectionHeading(section: SectionKey, style: RenderStyle): string {
  const uk = isBritish(style.spelling);
  switch (section) {
    case "summary":
      return style.summaryLabel;
    case "skills":
      return uk ? "Key Skills" : "Skills";
    case "experience":
      return uk ? "Work Experience" : "Professional Experience";
    case "projects":
      return "Projects";
    case "education":
      return "Education";
    case "certifications":
      return uk ? "Certifications & Licences" : "Certifications & Licenses";
    case "awards":
      return uk ? "Awards & Honours" : "Awards & Honors";
    case "languages":
      return "Languages";
  }
}

/** Visible sections in order: resume.meta.sectionOrder → style order → any remaining. Empty and hidden sections are skipped. */
export function orderedSections(r: ResumeData, style: RenderStyle): SectionKey[] {
  const hidden = new Set(r.meta?.hiddenSections ?? []);
  const wanted = [...(r.meta?.sectionOrder ?? []), ...style.sectionOrder, ...SECTION_KEYS].filter((s): s is SectionKey => (SECTION_KEYS as readonly string[]).includes(s));
  const out: SectionKey[] = [];
  for (const s of wanted) {
    if (out.includes(s) || hidden.has(s) || isEmptySection(r, s)) continue;
    out.push(s);
  }
  return out;
}

export function isEmptySection(r: ResumeData, s: SectionKey): boolean {
  switch (s) {
    case "summary":
      return !r.summary?.trim();
    case "skills":
      return !r.skills.some((g) => g.items.length);
    case "experience":
      return r.experience.length === 0;
    case "projects":
      return r.projects.length === 0;
    case "education":
      return r.education.length === 0;
    case "certifications":
      return r.certifications.length === 0;
    case "awards":
      return r.awards.length === 0;
    case "languages":
      return r.languages.length === 0;
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2024-03" → "Mar 2024" (MMM yyyy) / "03/2024" (MM/yyyy) / "March 2024" (MMMM yyyy). Free text passes through. */
export function formatResumeDate(v: string | null | undefined, dateFormat: string): string {
  if (!v) return "";
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(v.trim());
  if (!m) return v;
  const y = m[1]!;
  if (!m[2]) return y;
  const mi = Number(m[2]) - 1;
  if (mi < 0 || mi > 11) return y;
  if (dateFormat.startsWith("MM/")) return `${m[2]}/${y}`;
  if (dateFormat.startsWith("MMMM")) return `${MONTHS_LONG[mi]} ${y}`;
  return `${MONTHS[mi]} ${y}`;
}

export function dateRange(start: string | null | undefined, end: string | null | undefined, style: RenderStyle, present = "Present") {
  const a = formatResumeDate(start, style.dateFormat);
  const b = end === null ? present : formatResumeDate(end, style.dateFormat);
  if (a && b) return `${a} – ${b}`;
  return a || b;
}

export function locationLine(r: ResumeData, style: RenderStyle) {
  const l = r.basics.location;
  const parts = [l.city, l.region, style.includeFullAddress ? l.country : null].filter((p) => p && p.trim());
  return parts.join(", ");
}

/** Contact items in display order (email, phone, location, links). */
export function contactItems(r: ResumeData, style: RenderStyle): { text: string; href?: string }[] {
  const out: { text: string; href?: string }[] = [];
  if (r.basics.email) out.push({ text: r.basics.email, href: `mailto:${r.basics.email}` });
  if (r.basics.phone) out.push({ text: r.basics.phone });
  const loc = locationLine(r, style);
  if (loc) out.push({ text: loc });
  for (const l of r.basics.links) out.push({ text: l.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), href: l.url });
  return out;
}

/** Personal details allowed by the style (DOB, nationality, work authorisation). */
export function personalDetails(r: ResumeData, style: RenderStyle): { label: string; value: string }[] {
  const uk = isBritish(style.spelling);
  const out: { label: string; value: string }[] = [];
  if (style.includeDob && r.basics.dateOfBirth) out.push({ label: "Date of birth", value: r.basics.dateOfBirth });
  if (style.includeNationality && r.basics.nationality) out.push({ label: "Nationality", value: r.basics.nationality });
  if (r.basics.workAuthorization) out.push({ label: uk ? "Right to work" : "Work authorization", value: r.basics.workAuthorization });
  return out;
}

export function educationLine(e: ResumeData["education"][number]) {
  return [e.degree, e.field].filter(Boolean).join(", ");
}

/** `{StudentName}_{Company}_{JobTitle}_{yyyy-mm-dd}` slugified (SPEC §9.6). */
export function resumeFileName(input: { studentName: string; company?: string | null; jobTitle?: string | null; date: Date; documentTitle?: string }, ext: "pdf" | "docx") {
  const part = (s: string) => slugify(s).split("-").filter(Boolean).map((w) => w[0]!.toUpperCase() + w.slice(1)).join("-");
  const pieces = [part(input.studentName) || "Candidate"];
  if (input.company) pieces.push(part(input.company));
  if (input.jobTitle) pieces.push(part(input.jobTitle));
  if (!input.company && !input.jobTitle) pieces.push(part(input.documentTitle ?? "Resume"));
  pieces.push(input.date.toISOString().slice(0, 10));
  return `${pieces.filter(Boolean).join("_")}.${ext}`;
}

/** Points per page for react-pdf / twips for docx. */
export const PAGE = {
  LETTER: { pdf: "LETTER" as const, widthTwip: 12240, heightTwip: 15840 },
  A4: { pdf: "A4" as const, widthTwip: 11906, heightTwip: 16838 },
};
