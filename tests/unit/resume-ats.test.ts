import { describe, expect, it } from "vitest";
import { computeAtsScore, titleSimilarity, ATS_WEIGHTS } from "@/server/ai/ats-score";
import { porterStem, stemmedTokens } from "@/server/ai/stem";
import { heuristicJdAnalysis } from "@/server/ai/jd-heuristic";
import { allProfileSkills } from "@/resume/schema";
import { ANALYSIS, JD_TEXT, MASTER, clone } from "./resume-fixtures";

describe("Porter stemmer", () => {
  it("stems classic examples", () => {
    expect(porterStem("caresses")).toBe("caress");
    expect(porterStem("ponies")).toBe("poni");
    expect(porterStem("relational")).toBe("relat");
    expect(porterStem("hopping")).toBe("hop");
    expect(porterStem("generalization")).toBe("gener");
    expect(porterStem("dashboards")).toBe(porterStem("dashboard"));
    expect(porterStem("testing")).toBe(porterStem("tests"));
  });

  it("treats US and UK spellings as the same token and keeps tech tokens", () => {
    expect(stemmedTokens("optimised")).toEqual(stemmedTokens("optimized"));
    expect(stemmedTokens("C++ and C# with Node.js")).toEqual(["c++", "and", "c#", "with", "node.js"]);
  });
});

describe("ATS score (§9.5)", () => {
  it("is deterministic and returns a full breakdown", () => {
    const a = computeAtsScore({ resume: MASTER, analysis: ANALYSIS, jobTitle: "Data Analyst", maxPages: 1, pageCount: 1 });
    const b = computeAtsScore({ resume: clone(MASTER), analysis: clone(ANALYSIS), jobTitle: "Data Analyst", maxPages: 1, pageCount: 1 });
    expect(a).toEqual(b);
    expect(Object.keys(a).sort()).toEqual(["format", "formatChecks", "keywordCoverage", "keywords", "score", "skillsOverlap", "titleSimilarity"].sort());
    const expected = Math.round(ATS_WEIGHTS.keywordCoverage * a.keywordCoverage + ATS_WEIGHTS.titleSimilarity * a.titleSimilarity + ATS_WEIGHTS.skillsOverlap * a.skillsOverlap + ATS_WEIGHTS.formatChecks * a.formatChecks);
    expect(a.score).toBe(expected);
  });

  it("weights required keywords ×2 and matches stemmed forms", () => {
    const r = computeAtsScore({ resume: MASTER, analysis: ANALYSIS, jobTitle: "Data Analyst", maxPages: 1, pageCount: 1 });
    const covered = Object.fromEntries(r.keywords.map((k) => [k.keyword, k.covered]));
    // "dashboards" matches "dashboards"; "A/B testing" matches "A/B test" (stemmed).
    expect(covered).toMatchObject({ SQL: true, Python: true, Tableau: true, Looker: true, dbt: true, Airflow: false, dashboards: true, "A/B testing": true, "stakeholder management": false });
    // required: 4×2 = 8 (all hit); nice: dbt hit, Airflow miss; keywords: 2 of 4 → (8+1+2)/(8+2+4) = 11/14
    expect(r.keywordCoverage).toBe(Math.round((11 / 14) * 100));
    expect(r.format).toEqual({ headings: true, noTablesOrImages: true, length: true, contact: true });
    expect(r.formatChecks).toBe(100);
  });

  it("scores a resume with more relevant content higher", () => {
    const weak = clone(MASTER);
    weak.skills = [{ group: "Core", items: ["Excel"] }];
    weak.experience.forEach((e) => (e.technologies = []));
    weak.summary = "";
    const base = computeAtsScore({ resume: weak, analysis: ANALYSIS, jobTitle: "Data Analyst" });
    const tailored = computeAtsScore({ resume: MASTER, analysis: ANALYSIS, jobTitle: "Data Analyst" });
    expect(tailored.score).toBeGreaterThan(base.score);
  });

  it("penalises format: missing contact, too many pages, hidden sections", () => {
    const r = clone(MASTER);
    r.basics.phone = "";
    r.meta = { hiddenSections: ["skills"] };
    const s = computeAtsScore({ resume: r, analysis: ANALYSIS, jobTitle: "Data Analyst", maxPages: 1, pageCount: 2 });
    expect(s.format).toEqual({ headings: false, noTablesOrImages: true, length: false, contact: false });
    expect(s.formatChecks).toBe(25);
  });

  it("title similarity ignores seniority words", () => {
    expect(titleSimilarity("Senior Data Analyst", MASTER)).toBe(100);
    expect(titleSimilarity("Software Engineer", MASTER)).toBe(0);
  });
});

describe("heuristic JD analysis (no API key)", () => {
  it("finds profile and common skills, splitting required vs nice-to-have", () => {
    const a = heuristicJdAnalysis({ jd: JD_TEXT, title: "Senior Data Analyst", profileSkills: allProfileSkills(MASTER) });
    expect(a.requiredSkills).toEqual(expect.arrayContaining(["SQL", "Python", "Tableau", "Looker"]));
    expect(a.niceToHaveSkills).toEqual(expect.arrayContaining(["dbt", "Airflow"]));
    expect(a.requiredSkills).not.toContain("Airflow");
    expect(a.seniority).toBe("Senior");
    expect(a.method).toBe("heuristic");
  });
});
