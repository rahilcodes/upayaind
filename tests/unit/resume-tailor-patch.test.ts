import { describe, expect, it } from "vitest";
import { TailorPatch, applyTailorPatch, masterForPrompt, trimJdForPrompt } from "@/server/ai/tailor-patch";
import { tailorResumePrompt } from "@/server/ai/prompts";
import { toolSchema } from "@/server/ai/client";
import { knownSkillMatcher, stripUnknownSkills, validateTailored } from "@/server/ai/validators";
import { ANALYSIS, JD_TEXT, MASTER, PATCH, clone, patchFrom } from "./resume-fixtures";

const STYLE = { code: "US", name: "US resume", documentTitle: "Resume", pageSize: "LETTER", maxPages: 1, dateFormat: "MMM yyyy", spelling: "en-US", includePhoto: false, includeDob: false, includeNationality: false, summaryLabel: "Summary", sectionOrder: ["summary", "skills", "experience", "education"], rulesPrompt: "" };

describe("tailoring patch (D-156) — compact input", () => {
  it("masterForPrompt drops contact details, links and bullet ids but keeps every fact the model may use", () => {
    const m = masterForPrompt(MASTER);
    const json = JSON.stringify(m);
    expect(json).not.toContain("priya@example.com");
    expect(json).not.toContain("linkedin.com");
    expect(json).not.toContain("exp_1_b1");
    expect(m).toMatchObject({ name: "Priya Sharma", headline: "Data Analyst" });
    expect((m.experience as { id: string; dates: string; bullets: string[] }[])[0]).toMatchObject({ id: "exp_1", dates: "2023-02 – present", bullets: expect.arrayContaining([expect.stringContaining("Tableau dashboards")]) });
    expect(m.education).toEqual(["B.S. Statistics — University of Texas at Austin (2021)"]);
    expect(m.certifications).toEqual(["Tableau Desktop Specialist"]);
    expect(json.length).toBeLessThan(JSON.stringify(MASTER).length * 0.75);
  });

  it("trimJdForPrompt removes boilerplate paragraphs and caps the length", () => {
    const jd = `${JD_TEXT}\n\nWe are proud to be an equal opportunity employer and consider all qualified applicants without regard to race.\n\nBenefits include 401(k) matching, dental and vision insurance and unlimited PTO.\n\nRequirements:\n- SQL\n- Python`;
    const t = trimJdForPrompt(jd);
    expect(t).toContain("Data Analyst to join our growth team");
    expect(t).toContain("- SQL");
    expect(t).not.toContain("equal opportunity");
    expect(t).not.toContain("401(k)");
    const long = trimJdForPrompt("word ".repeat(5000), 1000);
    expect(long.length).toBeLessThanOrEqual(1010);
    expect(long.endsWith("[…]")).toBe(true);
    expect(trimJdForPrompt("Equal opportunity employer.")).toBe("Equal opportunity employer."); // a JD that is only boilerplate still goes through
  });

  it("the whole tailoring prompt for the fixture fits a tight character budget (guards against creep)", () => {
    const p = tailorResumePrompt({ style: STYLE, market: { name: "United States" }, master: MASTER, job: { title: "Data Analyst", company: "Northstar Bank" }, analysis: ANALYSIS, jd: JD_TEXT });
    const schema = JSON.stringify(toolSchema(TailorPatch));
    expect(p.system.length).toBeLessThan(3600);
    expect(schema.length).toBeLessThan(2400);
    expect(p.user.length).toBeLessThan(JSON.stringify(MASTER).length + JSON.stringify(ANALYSIS).length + JD_TEXT.length + 400);
    expect(p.system).toContain("TRUTHFULNESS RULES");
    expect(p.user.indexOf("<master_profile>")).toBeLessThan(p.user.indexOf("JOB:"));
  });
});

describe("tailoring patch (D-156) — merge", () => {
  it("an identity patch reproduces the master (bullet ids kept by position)", () => {
    const r = applyTailorPatch(MASTER, PATCH);
    expect(r.basics).toEqual(MASTER.basics);
    expect(r.education).toEqual(MASTER.education);
    expect(r.certifications).toEqual(MASTER.certifications);
    expect(r.experience.map((e) => [e.id, e.company, e.startDate, e.endDate])).toEqual(MASTER.experience.map((e) => [e.id, e.company, e.startDate, e.endDate]));
    expect(r.experience[0]!.bullets).toEqual(MASTER.experience[0]!.bullets);
    const extra = applyTailorPatch(MASTER, { ...PATCH, experience: [{ id: "exp_3", bullets: ["a", "b"] }, ...PATCH.experience.slice(0, 2)] });
    expect(extra.experience[0]!.bullets.map((b) => b.id)).toEqual(["exp_3_b1", "exp_3_t2"]);
    expect(validateTailored(MASTER, r).ok).toBe(true);
  });

  it("applies headline, summary, skills, bullet rewrites, role order and section order; unknown ids are ignored", () => {
    const patch = clone(PATCH);
    patch.headline = "Senior Data Analyst";
    patch.summary = "Analyst who ships Looker dashboards.";
    patch.skills = [{ group: "Key skills", items: ["SQL", "Looker", "Tableau"] }];
    patch.experience = [
      { id: "exp_2", bullets: ["Automated inventory reports with Python."] },
      { id: "exp_1", bullets: ["Built Looker and Tableau dashboards.", " "], technologies: ["Looker"] },
      { id: "exp_1", bullets: ["duplicate"] },
      { id: "exp_fake", bullets: ["Invented role"] },
    ];
    patch.sectionOrder = ["summary", "experience", "skills", "education"];
    patch.hiddenSections = ["awards"];
    const r = applyTailorPatch(MASTER, patch);
    expect(r.basics.headline).toBe("Senior Data Analyst");
    expect(r.summary).toBe("Analyst who ships Looker dashboards.");
    expect(r.skills).toEqual([{ group: "Key skills", items: ["SQL", "Looker", "Tableau"] }]);
    expect(r.experience.map((e) => e.id)).toEqual(["exp_2", "exp_1"]);
    expect(r.experience[1]!.bullets).toEqual([{ id: "exp_1_b1", text: "Built Looker and Tableau dashboards." }]);
    expect(r.experience[1]!.technologies).toEqual(["Looker"]);
    expect(r.experience[0]!.technologies).toEqual(MASTER.experience[1]!.technologies);
    expect(r.meta).toEqual({ sectionOrder: ["summary", "experience", "skills", "education"], hiddenSections: ["awards"] });
  });

  it("a role with no bullets keeps the profile's bullets; empty skills/summary fall back to the master", () => {
    const patch = { ...clone(PATCH), summary: "", skills: [], experience: [{ id: "exp_1", bullets: [] }, { id: "exp_2", bullets: ["x"] }, { id: "exp_3", bullets: ["y"] }] };
    const r = applyTailorPatch(MASTER, patch);
    expect(r.summary).toBe(MASTER.summary);
    expect(r.skills).toEqual(MASTER.skills);
    expect(r.experience[0]!.bullets).toEqual(MASTER.experience[0]!.bullets);
  });

  it("projects: omitted field keeps them, listed ids select and rewrite them", () => {
    const master = clone(MASTER);
    master.projects = [
      { id: "p1", name: "Churn model", description: "Predicts churn.", bullets: ["Built in Python."] },
      { id: "p2", name: "ETL", description: "Loads data.", bullets: [] },
    ];
    expect(applyTailorPatch(master, patchFrom(master)).projects).toEqual(master.projects);
    const r = applyTailorPatch(master, { ...patchFrom(master), projects: [{ id: "p2", bullets: ["Loads 1M rows nightly."] }, { id: "nope", bullets: ["x"] }] });
    expect(r.projects).toEqual([{ id: "p2", name: "ETL", description: "Loads data.", bullets: ["Loads 1M rows nightly."] }]);
  });

  it("the patch schema accepts what the prompt asks for and rejects a full resume", () => {
    expect(TailorPatch.safeParse(PATCH).success).toBe(true);
    expect(TailorPatch.safeParse(MASTER).success).toBe(false);
  });
});

describe("validator — alias-aware skills and repair (D-156)", () => {
  const known = knownSkillMatcher(MASTER);
  it("accepts exact, alias and bracketed forms of a profile skill", () => {
    expect(known("SQL")).toBe(true);
    expect(known("sql")).toBe(true);
    expect(known("Microsoft Excel")).toBe(true); // alias of Excel
    expect(known("MS Excel")).toBe(true);
    expect(known("Microsoft Excel (Excel)")).toBe(true);
    expect(known("PostgreSQL (SQL)")).toBe(true); // bracket names a profile skill
    expect(known("SQL (PostgreSQL)")).toBe(true);
    expect(known("Tableau Desktop")).toBe(false); // longer phrase = different claim
    expect(known("Advanced Excel")).toBe(false);
    expect(known("Kubernetes")).toBe(false);
    expect(known("Kubernetes (k8s)")).toBe(false);
    expect(known("Python (Pandas)")).toBe(true); // outer part is a profile skill
    expect(known("Reporting skills")).toBe(false);
    expect(known("")).toBe(false);
  });

  it("validateTailored no longer rejects JD-wording aliases of profile skills", () => {
    const out = clone(MASTER);
    out.skills[0]!.items = ["Microsoft Excel (Excel)", "SQL", "Python (pandas)"];
    expect(validateTailored(MASTER, out).ok).toBe(true);
  });

  it("stripUnknownSkills removes only unknown skills from groups and technologies and reports them once", () => {
    const out = clone(MASTER);
    out.skills[0]!.items.push("Kubernetes", "Airflow");
    out.skills.push({ group: "Cloud", items: ["Kubernetes"] });
    out.experience[0]!.technologies.push("Airflow");
    const { resume, removed } = stripUnknownSkills(MASTER, out);
    expect(removed).toEqual(["Kubernetes", "Airflow"]);
    expect(resume.skills).toEqual(MASTER.skills);
    expect(resume.experience[0]!.technologies).toEqual(MASTER.experience[0]!.technologies);
    expect(validateTailored(MASTER, resume).ok).toBe(true);
    expect(out.skills.some((g) => g.items.includes("Kubernetes"))).toBe(true); // input untouched
  });
});
