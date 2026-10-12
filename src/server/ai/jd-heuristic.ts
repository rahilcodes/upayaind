import type { JdAnalysisData } from "./schemas";
import { stemmedTokens, containsPhrase, tokenize } from "./stem";

/**
 * Deterministic JD analysis used when the AI isn't configured, so the
 * workspace still shows coverage and an ATS score. It recognises skills from
 * the student's master profile plus a list of common skills, and picks
 * frequent terms as keywords. Results are flagged `method: "heuristic"`.
 */

const COMMON_SKILLS = [
  "Python", "SQL", "Java", "JavaScript", "TypeScript", "C++", "C#", "Go", "Rust", "Ruby", "PHP", "Scala", "Kotlin", "Swift", "R",
  "React", "Angular", "Vue", "Next.js", "Node.js", "Express", "Django", "Flask", "FastAPI", "Spring", "Spring Boot", ".NET",
  "AWS", "Azure", "GCP", "Google Cloud", "Docker", "Kubernetes", "Terraform", "CI/CD", "Jenkins", "GitHub Actions", "Git", "Linux",
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "Snowflake", "BigQuery", "Redshift", "Databricks", "Spark", "Hadoop", "Kafka", "Airflow", "dbt",
  "Tableau", "Power BI", "Looker", "Excel", "Pandas", "NumPy", "scikit-learn", "TensorFlow", "PyTorch", "Machine Learning", "Deep Learning",
  "NLP", "Statistics", "A/B Testing", "ETL", "Data Modeling", "Data Visualization", "REST", "GraphQL", "Microservices", "HTML", "CSS",
  "Figma", "Jira", "Agile", "Scrum", "Salesforce", "SAP", "HubSpot", "Google Analytics", "SEO", "Product Management", "Project Management",
  "Stakeholder Management", "Communication", "Leadership", "Selenium", "Cypress", "Jest", "Unit Testing", "QA", "Security", "Networking",
];

const STOP = new Set(
  "a an and are as at be by for from has have in is it its of on or our that the their this to we will with you your who what which about across all also any can do etc more must not other over per such than them they these those through up use using via within work working years year experience ability strong skills team teams role job including include includes plus preferred required requirements responsibilities qualifications candidate candidates company business new well good great based level knowledge understanding minimum least one two three equivalent related field degree bachelor master like help make ensure provide support across day may".split(" "),
);

export function heuristicJdAnalysis(input: { jd: string; title: string; profileSkills: string[] }): JdAnalysisData & { method: "heuristic" } {
  const jd = input.jd;
  const jdTokens = stemmedTokens(jd);
  const lower = jd.toLowerCase();
  const preferredIdx = (() => {
    const m = /(nice to have|preferred|bonus|a plus|desirable)/i.exec(jd);
    return m ? m.index : -1;
  })();

  const found = new Map<string, { skill: string; pos: number }>();
  for (const s of [...input.profileSkills, ...COMMON_SKILLS]) {
    const phrase = stemmedTokens(s, { dropStopwords: true });
    if (!phrase.length) continue;
    const k = phrase.join(" ");
    if (found.has(k)) continue;
    // Single-letter skills ("R", "C") need a word-boundary match in the raw text.
    if (s.length <= 2) {
      const re = new RegExp(`(^|[^a-z0-9+#])${s.toLowerCase().replace(/[+#.]/g, "\\$&")}([^a-z0-9+#]|$)`);
      const m = re.exec(lower);
      if (m) found.set(k, { skill: s, pos: m.index });
      continue;
    }
    if (containsPhrase(jdTokens, phrase)) found.set(k, { skill: s, pos: lower.indexOf(s.toLowerCase().split(" ")[0]!) });
  }
  const skills = [...found.values()];
  const requiredSkills = skills.filter((s) => preferredIdx < 0 || s.pos < 0 || s.pos < preferredIdx).map((s) => s.skill);
  const niceToHaveSkills = skills.filter((s) => preferredIdx >= 0 && s.pos >= preferredIdx).map((s) => s.skill);

  // Keywords: most frequent meaningful unigrams/bigrams not already covered by skills.
  const raw = tokenize(jd).filter((t) => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t));
  const counts = new Map<string, { term: string; n: number }>();
  const bump = (term: string) => {
    const k = stemmedTokens(term).join(" ");
    if (found.has(k)) return;
    const c = counts.get(k);
    if (c) c.n++;
    else counts.set(k, { term, n: 1 });
  };
  for (let i = 0; i < raw.length; i++) {
    bump(raw[i]!);
    if (i + 1 < raw.length) bump(`${raw[i]} ${raw[i + 1]}`);
  }
  const keywords = [...counts.values()]
    .filter((c) => c.n >= 2)
    .sort((a, b) => b.n - a.n || b.term.split(" ").length - a.term.split(" ").length)
    .slice(0, 15)
    .map((c) => c.term);

  const seniority = /\b(principal|staff)\b/i.test(input.title) ? "Lead" : /\b(senior|sr\.?)\b/i.test(input.title) ? "Senior" : /\b(junior|jr\.?|entry|graduate|intern)\b/i.test(input.title) ? "Entry" : /\b(lead|manager|head)\b/i.test(input.title) ? "Manager" : "Mid";
  const firstSentences = jd.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).slice(0, 2).join(" ").slice(0, 400);

  return {
    requiredSkills,
    niceToHaveSkills,
    keywords,
    seniority,
    responsibilitiesSummary: firstSentences,
    titleKeywords: tokenize(input.title).filter((t) => !STOP.has(t) && !/^(senior|sr|junior|jr|ii|iii|i|lead)$/.test(t)),
    method: "heuristic",
  };
}
