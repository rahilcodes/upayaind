import type { ResumeData } from "@/resume/schema";
import type { JdAnalysisData } from "./schemas";
import { knownSkillMatcher } from "./validators";

/**
 * "Add the job description's skills" mode (D-165). The business confirmed that
 * its candidates state they hold the skills of the roles they are put forward
 * for, so — when the admin setting is on — the JD's required and nice-to-have
 * skills count as the candidate's skills for THAT application: they are added
 * to the profile the AI and the validator work from (never to the stored master
 * profile). Employers, titles, dates, education, certifications and numbers
 * stay locked to the real profile.
 */
export const JD_SKILLS_GROUP = "Role skills";

export function jdSkillsToAdd(master: Pick<ResumeData, "skills" | "experience">, analysis: Pick<JdAnalysisData, "requiredSkills" | "niceToHaveSkills"> | null | undefined): string[] {
  if (!analysis) return [];
  const known = knownSkillMatcher(master);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...analysis.requiredSkills, ...analysis.niceToHaveSkills]) {
    const s = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
    const k = s.toLowerCase();
    if (!s || s.length > 60 || seen.has(k) || known(s)) continue;
    seen.add(k);
    out.push(s);
  }
  return out.slice(0, 40);
}

/** The profile to tailor and validate against: the master plus the JD's skills (when enabled). */
export function withJdSkills(master: ResumeData, analysis: Pick<JdAnalysisData, "requiredSkills" | "niceToHaveSkills"> | null | undefined, enabled: boolean): { master: ResumeData; added: string[] } {
  if (!enabled) return { master, added: [] };
  const added = jdSkillsToAdd(master, analysis);
  if (!added.length) return { master, added };
  return { master: { ...master, skills: [...master.skills, { group: JD_SKILLS_GROUP, items: added }] }, added };
}
