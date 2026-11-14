import { describe, expect, it } from "vitest";
import { computeAtsScore } from "@/server/ai/ats-score";
import { JD_SKILLS_GROUP, jdSkillsToAdd, withJdSkills } from "@/server/ai/jd-skills";
import { jdSkillWarnings, validateTailored } from "@/server/ai/validators";
import { ANALYSIS, MASTER, clone } from "./resume-fixtures";

/** "Add the job description's skills" mode (D-165): off by default; when on, JD skills are allowed and listed. */
const JD = { ...ANALYSIS, requiredSkills: ["SQL", "Playwright", "TypeScript"], niceToHaveSkills: ["Docker", "sql"], keywords: [] };

describe("withJdSkills", () => {
  it("does nothing when the setting is off", () => {
    const r = withJdSkills(MASTER, JD, false);
    expect(r.master).toBe(MASTER);
    expect(r.added).toEqual([]);
  });

  it("adds only the JD skills the profile lacks, once each, without touching the original profile", () => {
    expect(jdSkillsToAdd(MASTER, JD)).toEqual(["Playwright", "TypeScript", "Docker"]);
    const before = JSON.stringify(MASTER);
    const r = withJdSkills(MASTER, JD, true);
    expect(r.master.skills.at(-1)).toEqual({ group: JD_SKILLS_GROUP, items: ["Playwright", "TypeScript", "Docker"] });
    expect(JSON.stringify(MASTER)).toBe(before);
    expect(r.master.experience).toEqual(MASTER.experience);
  });

  it("lets a resume list those skills only under the setting, and still rejects invented employers", () => {
    const out = clone(MASTER);
    out.skills = [{ group: "Key skills", items: ["SQL", "Playwright", "TypeScript", "Docker"] }, ...out.skills];
    expect(validateTailored(MASTER, out).errors.map((e) => e.code)).toContain("unknown_skill");
    const eff = withJdSkills(MASTER, JD, true).master;
    expect(validateTailored(eff, out).errors).toEqual([]);
    const fake = clone(out);
    fake.experience[0]!.company = "Google";
    expect(validateTailored(eff, fake).errors.map((e) => e.code)).toContain("company_changed");
    // The score reflects the fuller skills list.
    const a = computeAtsScore({ resume: MASTER, analysis: JD, jobTitle: "Data Analyst" });
    const b = computeAtsScore({ resume: out, analysis: JD, jobTitle: "Data Analyst" });
    expect(b.score).toBeGreaterThan(a.score);
    expect(b.skillsOverlap).toBe(100);
  });

  it("warns the specialist which skills came from the job description", () => {
    const w = jdSkillWarnings(["Playwright", "Docker"], (k) => k === "Playwright");
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ code: "jd_skill_added", severity: "warning" });
    expect(w[0]!.message).toContain("Playwright");
    expect(w[0]!.message).not.toContain("Docker");
    expect(jdSkillWarnings([], () => true)).toEqual([]);
  });
});
