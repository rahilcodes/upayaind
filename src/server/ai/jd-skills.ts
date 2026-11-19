import type { ResumeData } from "@/resume/schema";
import type { JdAnalysisData } from "./schemas";
import { resumeText } from "./ats-score";
import { containsPhrase, phraseCoverage, stemmedTokens } from "./stem";
import { knownSkillMatcher } from "./validators";

/**
 * "Add the job description's skills" mode (D-165). The business confirmed that
 * its candidates state they hold the skills of the roles they are put forward
 * for, so — when the admin setting is on — the JD's required and nice-to-have
 * skills — and, since D-166, its other ATS keywords — count as the candidate's
 * for THAT application: they are added to the profile the AI and the validator
 * work from (never to the stored master profile). Employers, titles, dates,
 * education, certifications and numbers stay locked to the real profile, so
 * keywords that name a credential (a certification, degree, licence, clearance
 * or years of experience) are never added.
 */
export const JD_SKILLS_GROUP = "Role skills";
export const JD_KEYWORDS_GROUP = "Core competencies";

type JdTerms = Pick<JdAnalysisData, "requiredSkills" | "niceToHaveSkills"> & { keywords?: string[] };

/** A keyword that claims a credential or tenure rather than a skill: never added automatically. */
const CREDENTIAL =
  /\b(certif\w*|certificate|degree|bachelor'?s?|master'?s|mba|ph\.?d|diploma|licen[cs]e\w*|clearance|citizen\w*|visa|sponsorship|years?|yrs?|ccna|ccnp|ccie|ccde|jncia|jncip|jncie|pmp|capm|prince2|csm|cspo|psm|safe agilist|itil|cissp|cisa|cism|crisc|ceh|oscp|comptia|security\+|network\+|a\+|rhcsa|rhce|cka|ckad|cks|mcsa|mcse|cpa|cfa|frm|cma|acca|shrm-?(cp|scp)|phr|sphr|cscp|cpim|cltd|(green|black|yellow) belt|pe|rn|bls|acls)(?![\w+])/i;

export function jdSkillsToAdd(master: Pick<ResumeData, "skills" | "experience">, analysis: JdTerms | null | undefined): string[] {
  if (!analysis) return [];
  const known = knownSkillMatcher(master);
  const seen = new Set<string>();
  const out: string[] = [];
  const take = (raw: string, keyword: boolean) => {
    const s = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
    const k = s.toLowerCase();
    if (!s || s.length > 60 || seen.has(k) || known(s)) return;
    if (keyword && (CREDENTIAL.test(s) || s.split(" ").length > 4)) return;
    seen.add(k);
    out.push(s);
  };
  for (const raw of [...analysis.requiredSkills, ...analysis.niceToHaveSkills]) take(raw, false);
  for (const raw of analysis.keywords ?? []) take(raw, true);
  return out.slice(0, 60);
}

/**
 * Guarantee (D-166): every term in `added` appears on the resume, judged the
 * way the ATS scorer judges it (stemmed, alias-aware, whole phrase). Terms the
 * model left out are appended: hard skills to the first skills group, other
 * keywords to a "Core competencies" group. Returns the same object when
 * nothing is missing.
 */
export function ensureJdSkillsListed(content: ResumeData, analysis: JdTerms | null | undefined, added: string[]): { resume: ResumeData; appended: string[] } {
  if (!added.length) return { resume: content, appended: [] };
  // The skills section is always shown in this mode, so read the resume with it visible.
  const hidden = (content.meta?.hiddenSections ?? []).filter((x) => x !== "skills");
  const haystack = stemmedTokens(resumeText({ ...content, meta: { ...content.meta, hiddenSections: hidden } }));
  const hard = new Set([...(analysis?.requiredSkills ?? []), ...(analysis?.niceToHaveSkills ?? [])].map((t) => t.trim().toLowerCase()));
  // Hard skills must be in the skills list itself (that is what an ATS skills match reads), keywords anywhere.
  const listed = [...content.skills.flatMap((g) => g.items), ...content.experience.flatMap((e) => e.technologies ?? [])].map((x) => stemmedTokens(x, { dropStopwords: true }));
  const missing = added.filter((t) => {
    const phrase = stemmedTokens(t, { dropStopwords: true });
    if (!phrase.length) return false;
    if (hard.has(t.toLowerCase())) return !listed.some((x) => containsPhrase(x, phrase));
    return phraseCoverage(haystack, phrase) < 1;
  });
  if (!missing.length) return { resume: content, appended: [] };
  const skills = content.skills.map((g) => ({ ...g, items: [...g.items] }));
  const hardMissing = missing.filter((t) => hard.has(t.toLowerCase()));
  const softMissing = missing.filter((t) => !hard.has(t.toLowerCase()));
  if (hardMissing.length) {
    if (skills[0]) skills[0].items.push(...hardMissing);
    else skills.push({ group: "Key skills", items: hardMissing });
  }
  if (softMissing.length) {
    const g = skills.find((x) => x.group.toLowerCase() === JD_KEYWORDS_GROUP.toLowerCase());
    if (g) g.items.push(...softMissing);
    else skills.push({ group: JD_KEYWORDS_GROUP, items: softMissing });
  }
  return { resume: { ...content, skills, meta: { ...content.meta, hiddenSections: hidden } }, appended: missing };
}

/** The profile to tailor and validate against: the master plus the JD's skills (when enabled). */
export function withJdSkills(master: ResumeData, analysis: JdTerms | null | undefined, enabled: boolean): { master: ResumeData; added: string[] } {
  if (!enabled) return { master, added: [] };
  const added = jdSkillsToAdd(master, analysis);
  if (!added.length) return { master, added };
  return { master: { ...master, skills: [...master.skills, { group: JD_SKILLS_GROUP, items: added }] }, added };
}
