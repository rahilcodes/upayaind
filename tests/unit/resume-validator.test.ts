import { describe, expect, it } from "vitest";
import { validateTailored, newGaps, errorsForPrompt } from "@/server/ai/validators";
import { MASTER, clone } from "./resume-fixtures";

const NOW = new Date("2026-10-12T00:00:00Z");
const v = (out: unknown) => validateTailored(MASTER, out, { now: NOW });
const codes = (out: unknown) => v(out).errors.map((e) => e.code);

describe("truthfulness validator — accepts legitimate tailoring", () => {
  it("accepts the master profile itself", () => {
    const r = v(clone(MASTER));
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("accepts reordered sections, bullets and skills, rephrased bullets and a rewritten summary", () => {
    const out = clone(MASTER);
    out.summary = "Analyst who ships Tableau and Looker dashboards and SQL pipelines for growth teams.";
    out.experience[0]!.bullets.reverse();
    out.experience[0]!.bullets[0]!.text = "Designed A/B test analyses together with product managers.";
    out.skills = [{ group: "Analytics", items: ["tableau", "Looker", "sql"] }, { group: "Programming", items: ["Python", "pandas"] }];
    out.meta = { hiddenSections: [], sectionOrder: ["skills", "summary", "experience", "education"] };
    const r = v(out);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("accepts dropping a short old internship when it creates no gap > 6 months", () => {
    const out = clone(MASTER);
    out.experience = out.experience.filter((e) => e.id !== "exp_3");
    expect(v(out).ok).toBe(true);
  });

  it("accepts trimming a job to one bullet and omitting certifications", () => {
    const out = clone(MASTER);
    out.experience[1]!.bullets = out.experience[1]!.bullets.slice(0, 1);
    out.certifications = [];
    expect(v(out).ok).toBe(true);
  });
});

describe("truthfulness validator — rejects adversarial output", () => {
  it("rejects an invented employer (new experience id)", () => {
    const out = clone(MASTER);
    out.experience.unshift({ id: "exp_99", company: "Google", title: "Senior Data Scientist", startDate: "2024-01", endDate: null, bullets: [], technologies: [] });
    expect(codes(out)).toContain("unknown_experience");
  });

  it("rejects an employer swapped into an existing id", () => {
    const out = clone(MASTER);
    out.experience[1]!.company = "Amazon";
    const r = v(out);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatchObject({ code: "company_changed", expected: "Contoso Retail", actual: "Amazon" });
  });

  it("rejects an inflated job title", () => {
    const out = clone(MASTER);
    out.experience[1]!.title = "Senior Data Analyst";
    expect(codes(out)).toEqual(["title_changed"]);
  });

  it("rejects stretched dates (start or end)", () => {
    const a = clone(MASTER);
    a.experience[0]!.startDate = "2022-02";
    expect(codes(a)).toContain("dates_changed");
    const b = clone(MASTER);
    b.experience[1]!.endDate = null; // claims still employed
    expect(codes(b)).toContain("dates_changed");
  });

  it("rejects a skill that isn't in skills or technologies (case-insensitive check)", () => {
    const out = clone(MASTER);
    out.skills[0]!.items.push("Airflow");
    const r = v(out);
    expect(r.errors.map((e) => e.code)).toEqual(["unknown_skill"]);
    expect(r.errors[0]!.message).toContain("Airflow");
  });

  it("rejects a skill smuggled into experience technologies", () => {
    const out = clone(MASTER);
    out.experience[0]!.technologies.push("Kubernetes");
    expect(codes(out)).toContain("unknown_skill");
  });

  it("rejects invented or upgraded education", () => {
    const a = clone(MASTER);
    a.education.push({ id: "edu_2", institution: "Stanford University", degree: "M.S.", field: "Computer Science", endDate: "2023" });
    expect(codes(a)).toContain("unknown_education");
    const b = clone(MASTER);
    b.education[0]!.degree = "M.S.";
    expect(codes(b)).toContain("education_changed");
  });

  it("rejects invented certifications, projects, awards and languages", () => {
    const out = clone(MASTER);
    out.certifications.push({ name: "AWS Certified Data Analytics" });
    out.projects.push({ id: "p1", name: "Fraud detector", description: "x", bullets: [] });
    out.awards.push("Employee of the Year");
    out.languages.push({ name: "Spanish", level: "Native" });
    expect(new Set(codes(out))).toEqual(new Set(["unknown_certification", "unknown_project", "unknown_award", "unknown_language"]));
  });

  it("rejects changed contact identity", () => {
    const out = clone(MASTER);
    out.basics.email = "someone@else.com";
    expect(codes(out)).toContain("identity_changed");
  });

  it("rejects dropping a job when it creates an unexplained gap > 6 months", () => {
    const out = clone(MASTER);
    out.experience = out.experience.filter((e) => e.id !== "exp_2"); // 2021-06 → 2023-01 = 20 months
    const r = v(out);
    expect(r.errors.map((e) => e.code)).toEqual(["gap_created"]);
    expect(r.errors[0]!.message).toMatch(/Junior Data Analyst at Contoso Retail/);
  });

  it("rejects duplicated experience entries and schema-invalid output", () => {
    const out = clone(MASTER);
    out.experience.push(clone(out.experience[0]!));
    expect(codes(out)).toContain("duplicate_experience");
    const bad = clone(MASTER) as unknown as { experience: { startDate: string }[] };
    bad.experience[0]!.startDate = "last year";
    expect(codes(bad)).toEqual(["schema"]);
  });

  it("warns (not blocks) on numbers that aren't in the master profile", () => {
    const out = clone(MASTER);
    out.experience[0]!.bullets[0]!.text = "Built Tableau dashboards that cut weekly reporting time by 70%.";
    const r = v(out);
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain("new_number");
  });

  it("formats errors for the retry prompt with the expected value", () => {
    const out = clone(MASTER);
    out.experience[1]!.title = "Lead Analyst";
    expect(errorsForPrompt(v(out))[0]).toContain('master profile says: "Junior Data Analyst"');
  });
});

describe("gap detection", () => {
  it("ignores gaps that already exist in the master profile", () => {
    const master = [
      { startDate: "2018-01", endDate: "2018-12" },
      { startDate: "2020-01", endDate: null },
    ];
    expect(newGaps(master, master, NOW)).toEqual([]);
    expect(newGaps(master, [master[1]!], NOW)).toEqual([]); // dropping the oldest job creates no gap inside the output span
  });
});
