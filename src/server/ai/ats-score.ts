import type { ResumeData } from "@/resume/schema";
import type { JdAnalysisData } from "./schemas";
import { containsPhrase, stemmedTokens } from "./stem";

/**
 * Deterministic ATS match score (SPEC §9.5) — a guide for employees, not a promise.
 * score = 0.5 × keywordCoverage + 0.2 × titleSimilarity + 0.2 × skillsOverlap + 0.1 × formatChecks
 * All components are 0–100. Same input → same output (no randomness, no AI).
 */

export type KeywordHit = { keyword: string; kind: "required" | "nice" | "keyword"; covered: boolean };

export type AtsBreakdown = {
  score: number;
  keywordCoverage: number;
  titleSimilarity: number;
  skillsOverlap: number;
  formatChecks: number;
  format: { headings: boolean; noTablesOrImages: boolean; length: boolean; contact: boolean };
  keywords: KeywordHit[];
};

export const ATS_WEIGHTS = { keywordCoverage: 0.5, titleSimilarity: 0.2, skillsOverlap: 0.2, formatChecks: 0.1 } as const;

const SENIORITY = new Set(["senior", "sr", "junior", "jr", "lead", "principal", "staff", "associate", "intern", "i", "ii", "iii", "iv", "1", "2", "3", "entry", "level", "mid"].map((w) => stemmedTokens(w)[0] ?? w));

/** All visible text of a resume (hidden sections excluded). */
export function resumeText(r: ResumeData): string {
  const hidden = new Set(r.meta?.hiddenSections ?? []);
  const parts: string[] = [r.basics.headline ?? ""];
  if (!hidden.has("summary")) parts.push(r.summary ?? "");
  if (!hidden.has("skills")) parts.push(...r.skills.flatMap((g) => [g.group, ...g.items]));
  if (!hidden.has("experience")) parts.push(...r.experience.flatMap((e) => [e.title, e.company, ...e.bullets.map((b) => b.text), ...(e.technologies ?? [])]));
  if (!hidden.has("projects")) parts.push(...r.projects.flatMap((p) => [p.name, p.description, ...p.bullets]));
  if (!hidden.has("education")) parts.push(...r.education.flatMap((e) => [e.degree, e.field ?? "", e.institution]));
  if (!hidden.has("certifications")) parts.push(...r.certifications.map((c) => c.name));
  if (!hidden.has("awards")) parts.push(...r.awards);
  if (!hidden.has("languages")) parts.push(...r.languages.map((l) => l.name));
  return parts.join(" \n ");
}

function resumeSkillTokens(r: ResumeData): string[][] {
  const hidden = new Set(r.meta?.hiddenSections ?? []);
  const items = [...(hidden.has("skills") ? [] : r.skills.flatMap((g) => g.items)), ...(hidden.has("experience") ? [] : r.experience.flatMap((e) => e.technologies ?? []))];
  return items.map((s) => stemmedTokens(s, { dropStopwords: true })).filter((t) => t.length);
}

function uniqueBy<T>(arr: T[], k: (t: T) => string) {
  const seen = new Set<string>();
  return arr.filter((x) => {
    const key = k(x);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function titleTokens(t: string) {
  return stemmedTokens(t, { dropStopwords: true }).filter((w) => !SENIORITY.has(w));
}

/** Share of the job title's meaningful words found in the best-matching resume title (0–100). */
export function titleSimilarity(jobTitle: string, r: ResumeData): number {
  const job = new Set(titleTokens(jobTitle));
  if (!job.size) return 0;
  const candidates = [r.basics.headline ?? "", ...r.experience.slice(0, 3).map((e) => e.title)].filter(Boolean);
  let best = 0;
  for (const c of candidates) {
    const toks = new Set(titleTokens(c));
    if (!toks.size) continue;
    let hit = 0;
    for (const w of job) if (toks.has(w)) hit++;
    // Dice coefficient: rewards both directions, so "Data Analyst" vs "Senior Data Analyst" = 100.
    const dice = (2 * hit) / (job.size + toks.size);
    const coverage = hit / job.size;
    best = Math.max(best, Math.max(dice, coverage * 0.9));
  }
  return Math.round(best * 100);
}

export function formatChecks(r: ResumeData, opts: { maxPages?: number; pageCount?: number; includePhoto?: boolean } = {}) {
  const hidden = new Set(r.meta?.hiddenSections ?? []);
  const headings = !hidden.has("experience") && r.experience.length > 0 && !hidden.has("education") && r.education.length > 0 && !hidden.has("skills") && r.skills.some((g) => g.items.length > 0);
  // Our templates never use layout tables or images of text; a photo is the only image and only when the style allows it.
  const noTablesOrImages = !(r.basics.photoKey && !opts.includePhoto);
  const length = opts.pageCount && opts.maxPages ? opts.pageCount <= opts.maxPages : estimatePages(r) <= (opts.maxPages ?? 2);
  const contact = Boolean(r.basics.email && r.basics.phone && r.basics.name);
  const format = { headings, noTablesOrImages, length, contact };
  const passed = Object.values(format).filter(Boolean).length;
  return { format, score: Math.round((passed / 4) * 100) };
}

/** Rough page estimate (≈ 46 lines per page) when no rendered page count is available. */
export function estimatePages(r: ResumeData): number {
  const hidden = new Set(r.meta?.hiddenSections ?? []);
  let lines = 6;
  const wrap = (t: string) => Math.max(1, Math.ceil(t.length / 105));
  if (!hidden.has("summary") && r.summary) lines += 2 + wrap(r.summary);
  if (!hidden.has("skills")) lines += 2 + r.skills.length;
  if (!hidden.has("experience")) for (const e of r.experience) lines += 2 + e.bullets.reduce((n, b) => n + wrap(b.text), 0) + 0.5;
  if (!hidden.has("projects")) for (const p of r.projects) lines += 2 + wrap(p.description) + p.bullets.reduce((n, b) => n + wrap(b), 0);
  if (!hidden.has("education")) lines += 2 + r.education.length * 1.6;
  if (!hidden.has("certifications") && r.certifications.length) lines += 2 + r.certifications.length;
  return Math.max(1, Math.ceil(lines / 46));
}

export function computeAtsScore(input: {
  resume: ResumeData;
  analysis: JdAnalysisData;
  jobTitle: string;
  maxPages?: number;
  pageCount?: number;
  includePhoto?: boolean;
}): AtsBreakdown {
  const { resume, analysis } = input;
  const haystack = stemmedTokens(resumeText(resume));

  const terms = uniqueBy(
    [
      ...analysis.requiredSkills.map((k) => ({ keyword: k.trim(), kind: "required" as const })),
      ...analysis.niceToHaveSkills.map((k) => ({ keyword: k.trim(), kind: "nice" as const })),
      ...analysis.keywords.map((k) => ({ keyword: k.trim(), kind: "keyword" as const })),
    ],
    (t) => stemmedTokens(t.keyword, { dropStopwords: true }).join(" "),
  );

  let totalW = 0;
  let hitW = 0;
  const keywords: KeywordHit[] = terms.map((t) => {
    const phrase = stemmedTokens(t.keyword, { dropStopwords: true });
    const covered = containsPhrase(haystack, phrase);
    const w = t.kind === "required" ? 2 : 1;
    totalW += w;
    if (covered) hitW += w;
    return { keyword: t.keyword, kind: t.kind, covered };
  });
  const keywordCoverage = totalW ? Math.round((hitW / totalW) * 100) : 0;

  const title = titleSimilarity(input.jobTitle, resume);

  const jdSkills = uniqueBy([...analysis.requiredSkills, ...analysis.niceToHaveSkills], (s) => stemmedTokens(s, { dropStopwords: true }).join(" "));
  const skillToks = resumeSkillTokens(resume);
  const skillHits = jdSkills.filter((s) => {
    const p = stemmedTokens(s, { dropStopwords: true });
    return skillToks.some((t) => t.join(" ") === p.join(" ") || containsPhrase(t, p));
  }).length;
  const skillsOverlap = jdSkills.length ? Math.round((skillHits / jdSkills.length) * 100) : 0;

  const fc = formatChecks(resume, input);

  const score = Math.round(
    ATS_WEIGHTS.keywordCoverage * keywordCoverage + ATS_WEIGHTS.titleSimilarity * title + ATS_WEIGHTS.skillsOverlap * skillsOverlap + ATS_WEIGHTS.formatChecks * fc.score,
  );
  return { score: Math.max(0, Math.min(100, score)), keywordCoverage, titleSimilarity: title, skillsOverlap, formatChecks: fc.score, format: fc.format, keywords };
}
