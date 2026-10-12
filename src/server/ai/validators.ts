import { ResumeJSON, allProfileSkills, type ResumeData } from "@/resume/schema";

/**
 * Post-generation truthfulness validator (SPEC §9.4) — code, not AI.
 * Runs after every AI tailoring AND after every manual edit in the editor.
 * Errors block "Mark as applied"; warnings are shown but don't block.
 */

export type IssueCode =
  | "schema"
  | "identity_changed"
  | "unknown_experience"
  | "duplicate_experience"
  | "company_changed"
  | "title_changed"
  | "dates_changed"
  | "unknown_skill"
  | "unknown_education"
  | "education_changed"
  | "unknown_certification"
  | "unknown_project"
  | "unknown_award"
  | "unknown_language"
  | "gap_created"
  | "new_number"
  | "too_long";

export type ValidationIssue = {
  code: IssueCode;
  severity: "error" | "warning";
  path: string;
  message: string;
  /** What the master profile says (for the diff view). */
  expected?: string;
  /** What the output says. */
  actual?: string;
};

export type ValidationResult = {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  checkedAt: string;
};

const norm = (s: string | null | undefined) => (s ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
const key = (s: string | null | undefined) => norm(s).toLowerCase();

/** "2024-03" → months since year 0; null (present) → `now`. */
function monthIndex(v: string | null, now: Date): number | null {
  if (v === null) return now.getUTCFullYear() * 12 + now.getUTCMonth();
  const m = /^(\d{4})-(\d{2})/.exec(v);
  if (!m) return null;
  return Number(m[1]) * 12 + Number(m[2]) - 1;
}

type Interval = [number, number];
function intervals(exps: { startDate: string; endDate: string | null }[], now: Date): Interval[] {
  const out: Interval[] = [];
  for (const e of exps) {
    const a = monthIndex(e.startDate, now);
    const b = monthIndex(e.endDate, now);
    if (a === null || b === null) continue;
    out.push([Math.min(a, b), Math.max(a, b)]);
  }
  return out;
}

const covered = (ivs: Interval[], m: number) => ivs.some(([a, b]) => m >= a && m <= b);

/**
 * Gap check (rule 3): months that the master timeline covers but the output
 * doesn't, between the output's earliest start and the master's latest end.
 * Returns runs of > 6 consecutive newly-uncovered months.
 */
export function newGaps(master: { startDate: string; endDate: string | null }[], output: { startDate: string; endDate: string | null }[], now = new Date()): { from: number; to: number; months: number }[] {
  const mi = intervals(master, now);
  const oi = intervals(output, now);
  if (!mi.length) return [];
  const end = Math.max(...mi.map((i) => i[1]));
  const start = oi.length ? Math.min(...oi.map((i) => i[0])) : Math.min(...mi.map((i) => i[0]));
  const runs: { from: number; to: number; months: number }[] = [];
  let runStart: number | null = null;
  for (let m = start; m <= end + 1; m++) {
    const isNewGap = m <= end && covered(mi, m) && !covered(oi, m);
    // A month that the master doesn't cover either is a pre-existing gap: it doesn't break a run.
    const preExistingGap = m <= end && !covered(mi, m) && !covered(oi, m);
    if (isNewGap) runStart ??= m;
    else if (!preExistingGap && runStart !== null) {
      const months = m - runStart;
      if (months > 6) runs.push({ from: runStart, to: m - 1, months });
      runStart = null;
    }
  }
  return runs;
}

const fmtMonth = (m: number) => `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;

/** Numbers (metrics) mentioned in a text: "45%", "$1.2M", "3,000" → "45", "1.2", "3000". */
export function numbersIn(text: string): string[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/,/g, "").replace(/\.0+$/, ""));
}

function masterText(m: ResumeData) {
  return [
    m.summary ?? "",
    m.basics.headline ?? "",
    ...m.experience.flatMap((e) => [e.company, e.title, e.startDate, e.endDate ?? "", ...e.bullets.map((b) => b.text)]),
    ...m.projects.flatMap((p) => [p.name, p.description, ...p.bullets]),
    ...m.education.flatMap((e) => [e.degree, e.field ?? "", e.grade ?? "", e.startDate ?? "", e.endDate ?? ""]),
    ...m.certifications.map((c) => `${c.name} ${c.date ?? ""}`),
    ...m.awards,
    ...m.skills.flatMap((g) => g.items),
  ].join(" \n ");
}

export function validateTailored(masterInput: unknown, outputInput: unknown, opts: { now?: Date; maxPages?: number; pageCount?: number } = {}): ValidationResult {
  const now = opts.now ?? new Date();
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const done = (): ValidationResult => ({ ok: errors.length === 0, errors, warnings, checkedAt: now.toISOString() });

  const mParsed = ResumeJSON.safeParse(masterInput);
  const oParsed = ResumeJSON.safeParse(outputInput);
  if (!oParsed.success) {
    for (const i of oParsed.error.issues.slice(0, 20)) {
      errors.push({ code: "schema", severity: "error", path: i.path.join("."), message: `Invalid resume data at ${i.path.join(".") || "root"}: ${i.message}` });
    }
    return done();
  }
  if (!mParsed.success) {
    errors.push({ code: "schema", severity: "error", path: "master", message: "The student's master profile is incomplete or invalid. Fix the profile first." });
    return done();
  }
  const master = mParsed.data;
  const out = oParsed.data;

  // Identity (name / email / phone must stay the student's own).
  for (const f of ["name", "email", "phone"] as const) {
    if (key(out.basics[f]) !== key(master.basics[f])) {
      errors.push({ code: "identity_changed", severity: "error", path: `basics.${f}`, message: `Contact ${f} differs from the master profile.`, expected: master.basics[f], actual: out.basics[f] });
    }
  }

  // Experience: match by id; company/title/dates identical.
  const byId = new Map(master.experience.map((e) => [e.id, e]));
  const seen = new Set<string>();
  out.experience.forEach((e, i) => {
    const path = `experience.${i}`;
    if (seen.has(e.id)) {
      errors.push({ code: "duplicate_experience", severity: "error", path, message: `"${e.title} at ${e.company}" appears twice.` });
      return;
    }
    seen.add(e.id);
    const m = byId.get(e.id);
    if (!m) {
      errors.push({ code: "unknown_experience", severity: "error", path, message: `"${e.title} at ${e.company}" isn't in the master profile. Employers and roles can't be added.`, actual: `${e.title} at ${e.company}` });
      return;
    }
    if (norm(e.company) !== norm(m.company)) errors.push({ code: "company_changed", severity: "error", path: `${path}.company`, message: `Company changed from "${m.company}" to "${e.company}".`, expected: m.company, actual: e.company });
    if (norm(e.title) !== norm(m.title)) errors.push({ code: "title_changed", severity: "error", path: `${path}.title`, message: `Job title at ${m.company} changed from "${m.title}" to "${e.title}".`, expected: m.title, actual: e.title });
    if (e.startDate !== m.startDate || (e.endDate ?? null) !== (m.endDate ?? null)) {
      errors.push({ code: "dates_changed", severity: "error", path: `${path}.dates`, message: `Dates at ${m.company} changed.`, expected: `${m.startDate} – ${m.endDate ?? "present"}`, actual: `${e.startDate} – ${e.endDate ?? "present"}` });
    }
  });

  // Skills: every skill must exist in master skills or technologies (case-insensitive).
  const known = new Set(allProfileSkills(master).map(key));
  const reported = new Set<string>();
  const checkSkill = (s: string, path: string) => {
    const k = key(s);
    if (!k || known.has(k) || reported.has(k)) return;
    reported.add(k);
    errors.push({ code: "unknown_skill", severity: "error", path, message: `Skill "${norm(s)}" isn't in the student's profile.`, actual: norm(s) });
  };
  out.skills.forEach((g, gi) => g.items.forEach((s, si) => checkSkill(s, `skills.${gi}.items.${si}`)));
  out.experience.forEach((e, ei) => (e.technologies ?? []).forEach((s, si) => checkSkill(s, `experience.${ei}.technologies.${si}`)));

  // Education: no new entries, no altered degrees.
  out.education.forEach((ed, i) => {
    const path = `education.${i}`;
    const m = master.education.find((x) => x.id === ed.id) ?? master.education.find((x) => key(x.institution) === key(ed.institution) && key(x.degree) === key(ed.degree));
    if (!m) {
      errors.push({ code: "unknown_education", severity: "error", path, message: `Education "${ed.degree}, ${ed.institution}" isn't in the master profile.`, actual: `${ed.degree}, ${ed.institution}` });
      return;
    }
    const diffs = (["institution", "degree", "field", "startDate", "endDate", "grade"] as const).filter((f) => key(ed[f]) !== key(m[f]));
    if (diffs.length) {
      errors.push({ code: "education_changed", severity: "error", path, message: `Education at ${m.institution} changed (${diffs.join(", ")}).`, expected: `${m.degree} ${m.field ?? ""} ${m.endDate ?? ""}`.trim(), actual: `${ed.degree} ${ed.field ?? ""} ${ed.endDate ?? ""}`.trim() });
    }
  });

  // Certifications, projects, awards, languages: subset only.
  const certNames = new Set(master.certifications.map((c) => key(c.name)));
  out.certifications.forEach((c, i) => {
    if (!certNames.has(key(c.name))) errors.push({ code: "unknown_certification", severity: "error", path: `certifications.${i}`, message: `Certification "${c.name}" isn't in the master profile.`, actual: c.name });
  });
  const projNames = new Set(master.projects.map((p) => key(p.name)));
  out.projects.forEach((p, i) => {
    if (!projNames.has(key(p.name))) errors.push({ code: "unknown_project", severity: "error", path: `projects.${i}`, message: `Project "${p.name}" isn't in the master profile.`, actual: p.name });
  });
  const awards = new Set(master.awards.map(key));
  out.awards.forEach((a, i) => {
    if (!awards.has(key(a))) errors.push({ code: "unknown_award", severity: "error", path: `awards.${i}`, message: `Award "${a}" isn't in the master profile.`, actual: a });
  });
  const langs = new Set(master.languages.map((l) => key(l.name)));
  out.languages.forEach((l, i) => {
    if (!langs.has(key(l.name))) errors.push({ code: "unknown_language", severity: "error", path: `languages.${i}`, message: `Language "${l.name}" isn't in the master profile.`, actual: l.name });
  });

  // Rule 3: dropping jobs must not create a > 6 month gap.
  for (const g of newGaps(master.experience, out.experience, now)) {
    const dropped = master.experience.filter((e) => !seen.has(e.id)).map((e) => `${e.title} at ${e.company}`);
    errors.push({
      code: "gap_created",
      severity: "error",
      path: "experience",
      message: `Removing ${dropped.join(", ") || "a job"} leaves a ${g.months}-month gap (${fmtMonth(g.from)} → ${fmtMonth(g.to)}). Keep it with one bullet instead.`,
    });
  }

  // Metrics: numbers that don't appear anywhere in the master profile (warning — rephrasing can legitimately change units).
  const masterNums = new Set(numbersIn(masterText(master)));
  const outTexts: [string, string][] = [
    ["summary", out.summary ?? ""],
    ...out.experience.flatMap((e, ei) => e.bullets.map((b, bi) => [`experience.${ei}.bullets.${bi}`, b.text] as [string, string])),
    ...out.projects.flatMap((p, pi) => [[`projects.${pi}.description`, p.description] as [string, string], ...p.bullets.map((b, bi) => [`projects.${pi}.bullets.${bi}`, b] as [string, string])]),
  ];
  const flagged = new Set<string>();
  for (const [path, text] of outTexts) {
    for (const n of numbersIn(text)) {
      if (masterNums.has(n) || flagged.has(n)) continue;
      flagged.add(n);
      warnings.push({ code: "new_number", severity: "warning", path, message: `The number "${n}" doesn't appear in the master profile — make sure it's a real figure.`, actual: n });
    }
  }

  if (opts.maxPages && opts.pageCount && opts.pageCount > opts.maxPages) {
    warnings.push({ code: "too_long", severity: "warning", path: "", message: `The resume is ${opts.pageCount} pages; this market's style allows ${opts.maxPages}. Trim bullets or hide a section.` });
  }

  return done();
}

/** Compact list for the retry prompt. */
export function errorsForPrompt(r: ValidationResult): string[] {
  return r.errors.map((e) => (e.expected ? `${e.message} (master profile says: "${e.expected}")` : e.message));
}
