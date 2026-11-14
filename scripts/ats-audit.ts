/**
 * Read-only audit of recent tailored resumes: where the ATS score loses points.
 *   npx tsx --conditions=react-server scripts/ats-audit.ts [days=7]
 * Prints aggregates only (no personal data).
 */
import "dotenv/config";
import { db } from "../src/server/db";
import { computeAtsScore } from "../src/server/ai/ats-score";
import { ResumeJSON, allProfileSkills } from "../src/resume/schema";
import { JdAnalysis } from "../src/server/ai/schemas";
import { stemmedTokens, containsPhrase } from "../src/server/ai/stem";

async function main() {
  const days = Number(process.argv[2] ?? 7);
  const rows = await db.resumeVersion.findMany({
    where: { kind: "TAILORED", createdAt: { gte: new Date(Date.now() - days * 86_400_000) }, jdAnalysis: { not: undefined } },
    select: { content: true, jdAnalysis: true, title: true, atsScore: true, atsScoreBase: true, student: { select: { masterProfile: true } } },
    take: 400,
    orderBy: { createdAt: "desc" },
  });
  const agg = { n: 0, score: 0, base: 0, kw: 0, title: 0, skills: 0, fmt: 0, reqTotal: 0, reqCovered: 0, reqMissingInProfile: 0, reqMissingButInProfile: 0, kwTotal: 0, kwCovered: 0, reqCount: 0, niceCount: 0, kwCount: 0 };
  const buckets: Record<string, number> = {};
  const missingTop = new Map<string, number>();
  for (const r of rows) {
    const c = ResumeJSON.safeParse(r.content);
    const a = JdAnalysis.safeParse(r.jdAnalysis);
    const m = ResumeJSON.safeParse(r.student.masterProfile);
    if (!c.success || !a.success || !m.success) continue;
    const s = computeAtsScore({ resume: c.data, analysis: a.data, jobTitle: r.title ?? "" });
    agg.n++; agg.score += s.score; agg.base += r.atsScoreBase ?? 0; agg.kw += s.keywordCoverage; agg.title += s.titleSimilarity; agg.skills += s.skillsOverlap; agg.fmt += s.formatChecks;
    agg.reqCount += a.data.requiredSkills.length; agg.niceCount += a.data.niceToHaveSkills.length; agg.kwCount += a.data.keywords.length;
    const b = `${Math.floor(s.score / 10) * 10}s`; buckets[b] = (buckets[b] ?? 0) + 1;
    const masterText = stemmedTokens(JSON.stringify(m.data));
    const profileSkills = new Set(allProfileSkills(m.data).map((x) => x.toLowerCase()));
    for (const k of s.keywords) {
      if (k.kind === "required") {
        agg.reqTotal++;
        if (k.covered) agg.reqCovered++;
        else {
          const inProfile = profileSkills.has(k.keyword.toLowerCase()) || containsPhrase(masterText, stemmedTokens(k.keyword, { dropStopwords: true }));
          if (inProfile) agg.reqMissingButInProfile++; else agg.reqMissingInProfile++;
          missingTop.set(k.keyword.toLowerCase(), (missingTop.get(k.keyword.toLowerCase()) ?? 0) + 1);
        }
      } else { agg.kwTotal++; if (k.covered) agg.kwCovered++; }
    }
  }
  const avg = (x: number) => Math.round(x / Math.max(1, agg.n));
  console.log(JSON.stringify({ resumes: agg.n, avgScore: avg(agg.score), avgBase: avg(agg.base), avgKeywordCoverage: avg(agg.kw), avgTitleSimilarity: avg(agg.title), avgSkillsOverlap: avg(agg.skills), avgFormat: avg(agg.fmt), avgRequiredPerJd: +(agg.reqCount / Math.max(1, agg.n)).toFixed(1), avgNicePerJd: +(agg.niceCount / Math.max(1, agg.n)).toFixed(1), avgKeywordsPerJd: +(agg.kwCount / Math.max(1, agg.n)).toFixed(1), requiredCoveredPct: Math.round((agg.reqCovered / Math.max(1, agg.reqTotal)) * 100), requiredMissing_notInProfile: agg.reqMissingInProfile, requiredMissing_butInProfile: agg.reqMissingButInProfile, otherCoveredPct: Math.round((agg.kwCovered / Math.max(1, agg.kwTotal)) * 100), buckets }, null, 1));
  console.log("top missing required:", [...missingTop.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, n]) => `${k}(${n})`).join(", "));
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
