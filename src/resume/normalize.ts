import { ResumeJSON, type ResumeData } from "./schema";

/**
 * Normalise a loosely-structured parsed resume (from Claude or the heuristic
 * parser) into a valid ResumeJSON master profile: stable ids, "YYYY-MM" dates,
 * absolute link URLs, and account fallbacks for required contact fields.
 */

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/** "Jan 2020" | "2020-1" | "01/2020" | "2020" | "Present" → "YYYY-MM" | null (present) | undefined (unknown). */
export function toYearMonth(raw: string | null | undefined): string | null | undefined {
  if (raw === null) return null;
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  if (!v) return undefined;
  if (/^(present|current|now|today|ongoing|till date|to date)$/.test(v)) return null;
  let m = /^(\d{4})[-/.](\d{1,2})/.exec(v);
  if (m) return fmt(Number(m[1]), Number(m[2]));
  m = /^(\d{1,2})[-/.](\d{4})/.exec(v);
  if (m) return fmt(Number(m[2]), Number(m[1]));
  m = /^([a-z]{3,9})\.?,?\s+(\d{4})/.exec(v);
  if (m && MONTHS[m[1]!.slice(0, m[1]!.startsWith("sept") ? 4 : 3)]) return fmt(Number(m[2]), MONTHS[m[1]!.slice(0, m[1]!.startsWith("sept") ? 4 : 3)]!);
  m = /^(?:summer|spring|fall|autumn|winter)?\s*(\d{4})$/.exec(v);
  if (m) return fmt(Number(m[1]), 1);
  return undefined;
}

function fmt(y: number, mo: number) {
  if (y < 1950 || y > 2100 || mo < 1 || mo > 12) return undefined;
  return `${y}-${String(mo).padStart(2, "0")}`;
}

function toUrl(u: string): string | null {
  const s = u.trim();
  if (!s) return null;
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).toString();
  } catch {
    return null;
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LooseResume = {
  basics: { name?: string; headline?: string; email?: string; phone?: string; location?: { city?: string; region?: string; country?: string }; links?: { label: string; url: string }[]; workAuthorization?: string };
  summary?: string;
  skills?: { group: string; items: string[] }[];
  experience?: { company: string; title: string; location?: string; startDate?: string | null; endDate?: string | null; bullets?: string[]; technologies?: string[] }[];
  projects?: { name: string; description?: string; bullets?: string[]; link?: string }[];
  education?: { institution: string; degree: string; field?: string; startDate?: string; endDate?: string; grade?: string }[];
  certifications?: { name: string; issuer?: string; date?: string }[];
  awards?: string[];
  languages?: { name: string; level: string }[];
};

export function normalizeParsedResume(p: LooseResume, fallback: { name: string; email: string; phone?: string | null; country?: string }): { resume: ResumeData; warnings: string[] } {
  const warnings: string[] = [];
  const clean = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim();
  const uniq = (arr: string[]) => [...new Map(arr.map((s) => [s.toLowerCase(), s])).values()];

  const email = EMAIL.test(clean(p.basics.email)) ? clean(p.basics.email) : fallback.email;
  if (email !== clean(p.basics.email)) warnings.push("Email wasn't found in the resume; using the account email.");
  const name = clean(p.basics.name) || fallback.name;

  const experience = (p.experience ?? [])
    .filter((e) => clean(e.company) || clean(e.title))
    .map((e, i) => {
      const id = `exp_${i + 1}`;
      let start = toYearMonth(e.startDate ?? undefined);
      const end = e.endDate === null ? null : toYearMonth(e.endDate);
      if (!start) {
        warnings.push(`Start date missing for "${clean(e.title)} at ${clean(e.company)}" — please fill it in.`);
        start = typeof end === "string" ? end : `${new Date().getUTCFullYear()}-01`;
      }
      return {
        id,
        company: clean(e.company) || "Unknown company",
        title: clean(e.title) || "Role",
        location: clean(e.location) || undefined,
        startDate: start,
        endDate: end === undefined ? null : end,
        bullets: (e.bullets ?? []).map(clean).filter(Boolean).map((text, b) => ({ id: `${id}_b${b + 1}`, text })),
        technologies: uniq((e.technologies ?? []).map(clean).filter(Boolean)),
      };
    });

  const resume = ResumeJSON.parse({
    basics: {
      name,
      headline: clean(p.basics.headline) || undefined,
      email,
      phone: clean(p.basics.phone) || fallback.phone || "",
      location: { city: clean(p.basics.location?.city), region: clean(p.basics.location?.region) || undefined, country: clean(p.basics.location?.country) || fallback.country || "" },
      links: (p.basics.links ?? []).map((l) => ({ label: clean(l.label) || "Link", url: toUrl(l.url) })).filter((l): l is { label: string; url: string } => Boolean(l.url)),
      workAuthorization: clean(p.basics.workAuthorization) || undefined,
    },
    summary: clean(p.summary).slice(0, 800) || undefined,
    skills: (p.skills ?? []).map((g) => ({ group: clean(g.group) || "Skills", items: uniq(g.items.map(clean).filter(Boolean)) })).filter((g) => g.items.length),
    experience,
    projects: (p.projects ?? []).filter((x) => clean(x.name)).map((x, i) => ({ id: `proj_${i + 1}`, name: clean(x.name), description: clean(x.description), bullets: (x.bullets ?? []).map(clean).filter(Boolean), link: x.link ? (toUrl(x.link) ?? undefined) : undefined })),
    education: (p.education ?? []).filter((e) => clean(e.institution) || clean(e.degree)).map((e, i) => ({
      id: `edu_${i + 1}`,
      institution: clean(e.institution) || "—",
      degree: clean(e.degree) || "—",
      field: clean(e.field) || undefined,
      startDate: (toYearMonth(e.startDate) ?? clean(e.startDate)) || undefined,
      endDate: (toYearMonth(e.endDate) ?? clean(e.endDate)) || undefined,
      grade: clean(e.grade) || undefined,
    })),
    certifications: (p.certifications ?? []).filter((c) => clean(c.name)).map((c) => ({ name: clean(c.name), issuer: clean(c.issuer) || undefined, date: (toYearMonth(c.date) ?? clean(c.date)) || undefined })),
    awards: (p.awards ?? []).map(clean).filter(Boolean),
    languages: (p.languages ?? []).filter((l) => clean(l.name)).map((l) => ({ name: clean(l.name), level: clean(l.level) || "Professional" })),
    meta: { hiddenSections: [] },
  });
  if (!resume.experience.length) warnings.push("No work experience was detected.");
  if (!resume.education.length) warnings.push("No education was detected.");
  if (!resume.skills.length) warnings.push("No skills section was detected.");
  return { resume, warnings };
}
