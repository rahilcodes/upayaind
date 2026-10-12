import type { LooseResume } from "./normalize";

/**
 * Best-effort resume parser used when the AI isn't configured (or fails), so
 * onboarding still produces an editable master profile. Results are flagged as
 * "heuristic" and the student is asked to review every section.
 */

const SECTION_PATTERNS: [keyof typeof EMPTY, RegExp][] = [
  ["summary", /^(professional\s+)?(summary|profile|objective|career objective|personal statement|about me|career summary|profile summary)$/i],
  ["experience", /^(professional\s+|work\s+|relevant\s+)?(experience|employment( history)?|work history|career history)$/i],
  ["education", /^(education|academic background|academics|qualifications|education (and|&) training)$/i],
  ["skills", /^((key|technical|core|relevant)\s+)?(skills|competencies|technologies|tech stack|skills (and|&) tools|tools)$/i],
  ["projects", /^((academic|personal|key)\s+)?projects$/i],
  ["certifications", /^(certifications?|licenses?|licences?|certifications? (and|&) licen[cs]es?|courses)$/i],
  ["awards", /^(awards|honou?rs|achievements|awards (and|&) honou?rs)$/i],
  ["languages", /^languages$/i],
];

const EMPTY = { summary: [] as string[], experience: [] as string[], education: [] as string[], skills: [] as string[], projects: [] as string[], certifications: [] as string[], awards: [] as string[], languages: [] as string[], header: [] as string[] };

const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATE = `(?:${MONTH}\\.?\\s+\\d{4}|\\d{1,2}[/.-]\\d{4}|\\d{4}[/.-]\\d{1,2}|\\d{4})`;
const RANGE = new RegExp(`(${DATE})\\s*(?:-|–|—|to|until)\\s*(${DATE}|present|current|now|till date|to date)`, "i");
const BULLET = /^\s*(?:[•●▪◦‣∙·\-*–]|\d+[.)])\s+/;

export function heuristicParseResume(text: string): LooseResume {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/\t/g, " ").replace(/\s{2,}/g, " ").trim())
    .filter((l) => l.length > 0);

  // Split into sections.
  const sections: Record<string, string[]> = structuredClone(EMPTY);
  let current: keyof typeof EMPTY = "header";
  for (const l of lines) {
    const bare = l.replace(/[:|]+$/, "").trim();
    const hit = bare.length <= 40 ? SECTION_PATTERNS.find(([, re]) => re.test(bare)) : undefined;
    if (hit) {
      current = hit[0];
      continue;
    }
    sections[current]!.push(l);
  }

  const all = lines.join("\n");
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(all)?.[0];
  const phone = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|\+\d[\d\s-]{8,15}\d/.exec(all)?.[0];
  const linkMatches = [...all.matchAll(/(?:https?:\/\/)?(?:www\.)?(linkedin\.com\/in\/[\w-]+|github\.com\/[\w-]+|[\w-]+\.(?:dev|io|me|com)\/[\w\-/]*)/gi)].map((m) => m[0]);
  const links = [...new Set(linkMatches)].slice(0, 4).map((u) => ({ label: /linkedin/i.test(u) ? "LinkedIn" : /github/i.test(u) ? "GitHub" : "Portfolio", url: u }));

  const header = sections.header!;
  const name = header.find((l) => !l.includes("@") && !/\d{3}/.test(l) && l.split(" ").length <= 5 && /^[A-Za-z][A-Za-z .'-]+$/.test(l));
  const headline = header.find((l) => l !== name && !l.includes("@") && !/\d{3}/.test(l) && !/linkedin|github|http/i.test(l) && l.length < 80);
  const locLine = header.find((l) => /^[A-Za-z .'-]+,\s*[A-Za-z .]+$/.test(l) && l !== name);
  const [city, region] = locLine ? locLine.split(",").map((s) => s.trim()) : ["", ""];

  return {
    basics: { name, headline, email, phone, location: { city: city ?? "", region: region || undefined }, links },
    summary: sections.summary!.join(" "),
    skills: parseSkills(sections.skills!),
    experience: parseExperience(sections.experience!),
    projects: parseProjects(sections.projects!),
    education: parseEducation(sections.education!),
    certifications: sections.certifications!.map((l) => ({ name: l.replace(BULLET, "") })),
    awards: sections.awards!.map((l) => l.replace(BULLET, "")),
    languages: sections.languages!.flatMap((l) => l.split(/[,;|]/)).map((s) => s.trim()).filter(Boolean).map((s) => {
      const m = /^(.+?)\s*[(\-–:]\s*([^)]+)\)?$/.exec(s);
      return m ? { name: m[1]!.trim(), level: m[2]!.trim() } : { name: s, level: "Professional" };
    }),
  };
}

function parseSkills(lines: string[]) {
  const groups: { group: string; items: string[] }[] = [];
  for (const l of lines) {
    const line = l.replace(BULLET, "");
    const m = /^([A-Za-z &/]{2,30}):\s*(.+)$/.exec(line);
    const items = (m ? m[2]! : line).split(/[,;|•·]/).map((s) => s.trim()).filter((s) => s && s.length <= 40);
    if (!items.length) continue;
    if (m) groups.push({ group: m[1]!.trim(), items });
    else {
      const g = groups.find((x) => x.group === "Skills") ?? (groups.push({ group: "Skills", items: [] }), groups[groups.length - 1]!);
      g.items.push(...items);
    }
  }
  return groups;
}

function splitTitleCompany(s: string): { title: string; company: string } {
  const cleaned = s.replace(/[|,–—-]\s*$/, "").trim();
  const at = /^(.+?)\s+(?:at|@)\s+(.+)$/i.exec(cleaned);
  if (at) return { title: at[1]!.trim(), company: at[2]!.trim() };
  const parts = cleaned.split(/\s+[|–—-]\s+|,\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { title: parts[0]!, company: parts[1]! };
  return { title: cleaned, company: "" };
}

function parseExperience(lines: string[]) {
  type E = { company: string; title: string; location?: string; startDate?: string; endDate?: string | null; bullets: string[] };
  const out: E[] = [];
  let cur: E | null = null;
  let pendingHeader: string[] = [];
  for (const l of lines) {
    const range = RANGE.exec(l);
    if (range) {
      const rest = l.replace(range[0], "").replace(/[()|,–—-]+\s*$/, "").replace(/^\s*[|,–—-]+/, "").trim();
      const head = [...pendingHeader, rest].filter(Boolean);
      const first = head[0] ?? "";
      const split = splitTitleCompany(first);
      const title = split.title;
      const company = split.company || (head[1] ? splitTitleCompany(head[1]).title : "");
      const end = /present|current|now|till date|to date/i.test(range[2]!) ? null : range[2]!;
      cur = { title, company, startDate: range[1]!, endDate: end, bullets: [] };
      out.push(cur);
      pendingHeader = [];
      continue;
    }
    if (BULLET.test(l)) {
      if (cur) cur.bullets.push(l.replace(BULLET, ""));
      continue;
    }
    // A short non-bullet line after bullets probably starts the next entry.
    if (l.length <= 90 && (!cur || cur.bullets.length > 0)) pendingHeader.push(l);
    else if (cur && !cur.company && l.length <= 90) cur.company = l;
    else if (cur) cur.bullets.push(l);
    if (pendingHeader.length > 2) pendingHeader = pendingHeader.slice(-2);
  }
  return out.filter((e) => e.title || e.company);
}

const DEGREE = /\b(bachelor|master|b\.?\s?s\.?c?|m\.?\s?s\.?c?|b\.?a\.?|m\.?a\.?|b\.?tech|m\.?tech|b\.?e\.?|m\.?e\.?|mba|ph\.?d|associate|diploma|doctor|bsc|msc|ba|ma)\b/i;
const SCHOOL = /\b(university|college|institute|school|academy|polytechnic|iit|nit)\b/i;

function parseEducation(lines: string[]) {
  const out: { institution: string; degree: string; field?: string; endDate?: string; grade?: string }[] = [];
  let cur: (typeof out)[number] | null = null;
  for (const raw of lines) {
    const l = raw.replace(BULLET, "");
    const year = /(?:19|20)\d{2}(?!.*(?:19|20)\d{2})/.exec(l)?.[0];
    const grade = /(?:gpa|cgpa|grade)[:\s]*([\d.]+(?:\s*\/\s*[\d.]+)?)/i.exec(l)?.[1];
    if (SCHOOL.test(l) && (!cur || cur.institution)) {
      cur = { institution: l.replace(RANGE, "").replace(/(?:19|20)\d{2}/g, "").replace(/[,|–—-]+\s*$/, "").trim(), degree: "", endDate: year };
      out.push(cur);
    } else if (SCHOOL.test(l) && cur) {
      cur.institution = l.trim();
    } else if (DEGREE.test(l)) {
      if (!cur || cur.degree) {
        cur = { institution: "", degree: "", endDate: year };
        out.push(cur);
      }
      const [deg, field] = l.replace(/(?:19|20)\d{2}/g, "").split(/\s+in\s+|,\s+/i);
      cur.degree = (deg ?? l).trim();
      if (field) cur.field = field.replace(/[|–—-]+\s*$/, "").trim();
      cur.endDate ??= year;
    }
    if (cur && grade) cur.grade = grade;
  }
  return out;
}

function parseProjects(lines: string[]) {
  const out: { name: string; description: string; bullets: string[] }[] = [];
  for (const l of lines) {
    if (BULLET.test(l) && out.length) out[out.length - 1]!.bullets.push(l.replace(BULLET, ""));
    else {
      const [name, ...rest] = l.split(/\s[–—-]\s|:\s/);
      out.push({ name: (name ?? l).trim(), description: rest.join(" – ").trim(), bullets: [] });
    }
  }
  return out;
}
