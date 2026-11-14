import { z } from "zod";
import type { ResumeData } from "@/resume/schema";

/**
 * Token-lean tailoring contract (D-156).
 *
 * The model no longer re-types the whole resume. It receives a compact view of
 * the master profile (`masterForPrompt`) and returns only what tailoring may
 * change (`TailorPatch`): headline, summary, skill groups, the bullets and
 * technologies per role, project text, section order. `applyTailorPatch`
 * merges that onto the master profile, so contact details, dates, employers,
 * titles, education and certifications can never drift — and never cost output
 * tokens. Pure functions, unit-tested.
 */

export const TailorPatch = z.object({
  headline: z.string().optional().describe("Resume headline = the target role: the job title being applied for, optionally followed by ' | ' and 2–3 of the student's real top skills for it"),
  summary: z.string().max(800).describe("2–3 sentence professional summary built only from the student's real experience"),
  skills: z.array(z.object({ group: z.string(), items: z.array(z.string()) })).describe('Skill groups to show; first group "Key skills" lists the JD-matching skills first, in the JD\'s wording'),
  experience: z
    .array(
      z.object({
        id: z.string().describe("The role's id from MASTER_PROFILE"),
        bullets: z.array(z.string()).describe("Rewritten bullets for this role, most relevant first"),
        technologies: z.array(z.string()).optional().describe("Technologies used in this role (profile skills only); omit to keep the profile's list"),
      }),
    )
    .describe("Every role to show, in display order. A role left out is dropped from the resume — only allowed when that creates no gap over 6 months"),
  projects: z
    .array(z.object({ id: z.string(), description: z.string().optional(), bullets: z.array(z.string()).optional() }))
    .optional()
    .describe("Projects to show, in order, with optional rewritten text. Omit this field to keep the profile's projects unchanged"),
  sectionOrder: z.array(z.string()).optional().describe("Section keys in display order (summary, skills, experience, projects, education, certifications, awards, languages)"),
  hiddenSections: z.array(z.string()).optional().describe("Section keys to hide (e.g. awards)"),
});
export type TailorPatchData = z.infer<typeof TailorPatch>;

/** "2023-02" / null → "2023-02 – present". */
const span = (a: string | undefined, b: string | null | undefined) => (a || b ? `${a ?? "?"} – ${b ?? "present"}` : "");

/**
 * Compact master profile for the prompt: no contact details, links, photo
 * keys or bullet ids; one line per education / certification entry. Roughly
 * 35–45% fewer tokens than the raw JSON, and the model needs nothing more to
 * tailor truthfully (the server fills the rest back in).
 */
export function masterForPrompt(m: ResumeData): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: m.basics.name,
    headline: m.basics.headline || undefined,
    summary: m.summary || undefined,
    skills: m.skills.filter((g) => g.items.length),
    experience: m.experience.map((e) => ({
      id: e.id,
      title: e.title,
      company: e.company,
      dates: span(e.startDate, e.endDate),
      bullets: e.bullets.map((b) => b.text),
      ...(e.technologies?.length ? { technologies: e.technologies } : {}),
    })),
  };
  if (m.projects.length) out.projects = m.projects.map((p) => ({ id: p.id, name: p.name, description: p.description || undefined, bullets: p.bullets }));
  if (m.education.length) out.education = m.education.map((e) => `${[e.degree, e.field].filter(Boolean).join(" ")} — ${e.institution}${e.endDate ? ` (${e.endDate})` : ""}`);
  if (m.certifications.length) out.certifications = m.certifications.map((c) => c.name);
  if (m.awards.length) out.awards = m.awards;
  if (m.languages.length) out.languages = m.languages.map((l) => l.name);
  return out;
}

/**
 * Merge the model's patch onto the master profile. Unknown role / project ids
 * are ignored (an invented employer simply never appears); a role with no
 * bullets keeps the profile's bullets. Identity, dates, education and
 * certifications always come from the master.
 */
export function applyTailorPatch(master: ResumeData, patch: TailorPatchData): ResumeData {
  const roles = new Map(master.experience.map((e) => [e.id, e]));
  const seen = new Set<string>();
  const experience: ResumeData["experience"] = [];
  for (const p of patch.experience) {
    const m = roles.get(p.id);
    if (!m || seen.has(p.id)) continue;
    seen.add(p.id);
    const texts = p.bullets.map((t) => t.trim()).filter(Boolean);
    experience.push({
      ...m,
      // Keep the profile's bullet ids by position (editor assists address bullets by id); extra bullets get <expId>_tN.
      bullets: texts.length ? texts.map((text, i) => ({ id: m.bullets[i]?.id ?? `${m.id}_t${i + 1}`, text })) : m.bullets,
      technologies: p.technologies ?? m.technologies ?? [],
    });
  }

  let projects = master.projects;
  if (patch.projects) {
    const byId = new Map(master.projects.map((p) => [p.id, p]));
    const seenP = new Set<string>();
    projects = [];
    for (const p of patch.projects) {
      const m = byId.get(p.id);
      if (!m || seenP.has(p.id)) continue;
      seenP.add(p.id);
      const bullets = p.bullets?.map((t) => t.trim()).filter(Boolean);
      projects.push({ ...m, description: p.description?.trim() || m.description, bullets: bullets?.length ? bullets : m.bullets });
    }
  }

  const skills = patch.skills.map((g) => ({ group: g.group.trim() || "Skills", items: g.items.map((s) => s.trim()).filter(Boolean) })).filter((g) => g.items.length);

  return {
    ...master,
    basics: { ...master.basics, headline: patch.headline?.trim() || master.basics.headline },
    summary: patch.summary.trim() || master.summary,
    skills: skills.length ? skills : master.skills,
    experience: experience.length ? experience : master.experience,
    projects,
    meta: { sectionOrder: patch.sectionOrder?.length ? patch.sectionOrder : master.meta?.sectionOrder, hiddenSections: patch.hiddenSections ?? [] },
  };
}

const BOILERPLATE =
  /\b(equal[- ]opportunity|EEO|affirmative action|without regard to|discriminat|reasonable accommodation|background check|drug[- ]free|e-?verify|benefits? (package|include|offered)|401\s?\(?k\)?|dental|vision (insurance|coverage)|paid time off|\bPTO\b|parental leave|about (us|the company|our company|the team)\b|our (mission|story|values|culture)|privacy (policy|notice)|cookie|we are proud to be|diversity[, ]+equity|inclusive workplace|all qualified applicants)/i;

/**
 * Trim a job description for the prompt: drop boilerplate paragraphs (EEO,
 * benefits, "about us") that carry no requirements, then cap the length. The
 * JD analysis already lists every keyword, so the prompt only needs the
 * requirements and responsibilities text for wording.
 */
export function trimJdForPrompt(jd: string, maxChars = 7000): string {
  const paras = jd
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n|\n(?=\s*(?:[-•*·]|\d+[.)])\s)/)
    .map((p) => p.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
  const kept = paras.filter((p) => p.length < 40 || !BOILERPLATE.test(p));
  let text = (kept.length ? kept : paras).join("\n");
  if (text.length > maxChars) {
    const cut = text.lastIndexOf(" ", maxChars);
    text = `${text.slice(0, cut > maxChars * 0.8 ? cut : maxChars).trimEnd()}\n[…]`;
  }
  return text;
}
