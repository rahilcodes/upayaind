import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderResumePdf } from "@/resume/render-pdf";
import { renderResumeDocx } from "@/resume/render-docx";
import { FALLBACK_STYLE, formatResumeDate, orderedSections, resumeFileName, sectionHeading, type RenderStyle } from "@/resume/styles";
import { normalizeParsedResume, toYearMonth } from "@/resume/normalize";
import { heuristicParseResume } from "@/resume/parse-heuristic";
import { MASTER, clone } from "./resume-fixtures";

const US: RenderStyle = { ...FALLBACK_STYLE };
const UK: RenderStyle = { ...FALLBACK_STYLE, code: "UK_CV", documentTitle: "CV", pageSize: "A4", maxPages: 2, spelling: "en-GB", summaryLabel: "Personal Statement", sectionOrder: ["summary", "experience", "skills", "education", "projects", "certifications"] };

const OUT = process.env.RESUME_SAMPLES_DIR;
const save = (name: string, buf: Buffer) => {
  if (OUT) fs.writeFileSync(path.join(OUT, name), buf);
};

/** MediaBox of the first page in points. */
function mediaBox(pdf: Buffer) {
  const m = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf.toString("latin1"));
  return m ? [Math.round(Number(m[1])), Math.round(Number(m[2]))] : null;
}

async function pdfText(buf: Buffer) {
  const { PDFParse } = await import("pdf-parse");
  const p = new PDFParse({ data: new Uint8Array(buf) });
  try {
    return (await p.getText()).text;
  } finally {
    await p.destroy();
  }
}

async function pdfInfo(buf: Buffer): Promise<Record<string, string>> {
  const { PDFParse } = await import("pdf-parse");
  const p = new PDFParse({ data: new Uint8Array(buf) });
  try {
    return (await p.getInfo()).info ?? {};
  } finally {
    await p.destroy();
  }
}

/** Read one entry of a DOCX (zip) with the platform's unzip — tests only. */
async function docxXml(buf: Buffer, file = "word/document.xml") {
  const { execFileSync } = await import("node:child_process");
  const os = await import("node:os");
  const tmp = path.join(os.tmpdir(), `docx-${process.pid}-${Date.now()}.docx`);
  fs.writeFileSync(tmp, buf);
  try {
    return execFileSync("unzip", ["-p", tmp, file]).toString("utf8");
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

describe("US vs UK rendering (M5 acceptance)", () => {
  it("PDF: Letter + 'Resume' + Summary vs A4 + 'CV' + Personal Statement", async () => {
    const t0 = Date.now();
    const us = await renderResumePdf({ resume: MASTER, style: US, template: "classic" });
    const uk = await renderResumePdf({ resume: MASTER, style: UK, template: "modern" });
    expect(Date.now() - t0).toBeLessThan(6000);
    save("us.pdf", us.buffer);
    save("uk.pdf", uk.buffer);
    expect(mediaBox(us.buffer)).toEqual([612, 792]); // US Letter
    expect(mediaBox(uk.buffer)).toEqual([595, 842]); // A4
    expect(us.pages).toBe(1);
    expect((await pdfInfo(us.buffer)).Title).toBe("Priya Sharma – Resume");
    expect((await pdfInfo(uk.buffer)).Title).toBe("Priya Sharma – CV");

    const usText = await pdfText(us.buffer);
    const ukText = await pdfText(uk.buffer);
    expect(usText).toContain("SUMMARY");
    expect(usText).toContain("PROFESSIONAL EXPERIENCE");
    expect(usText).not.toMatch(/Personal Statement/i);
    expect(ukText).toContain("Personal Statement");
    expect(ukText).toContain("Work Experience");
    expect(ukText).toContain("Certifications & Licences");
    // Real, extractable text (ATS-safe), dates in month-year
    expect(usText).toContain("Northwind Analytics");
    expect(usText).toMatch(/Feb 2023 – Present/);
    // UK order: experience before skills
    expect(ukText.indexOf("Work Experience")).toBeLessThan(ukText.indexOf("Key Skills"));
  });

  it("DOCX: page size, proofing language and headings differ", async () => {
    const us = await renderResumeDocx({ resume: MASTER, style: US, template: "classic" });
    const uk = await renderResumeDocx({ resume: MASTER, style: UK, template: "classic" });
    save("us.docx", us);
    save("uk.docx", uk);
    const usXml = await docxXml(us);
    const ukXml = await docxXml(uk);
    expect(usXml).toMatch(/w:pgSz[^>]*w:w="12240"[^>]*w:h="15840"/);
    expect(ukXml).toMatch(/w:pgSz[^>]*w:w="11906"[^>]*w:h="16838"/);
    expect(usXml).toContain("SUMMARY");
    expect(ukXml).toContain("PERSONAL STATEMENT");
    expect(await docxXml(us, "word/styles.xml")).toContain('w:val="en-US"');
    expect(await docxXml(uk, "word/styles.xml")).toContain('w:val="en-GB"');
    expect(usXml).not.toContain("<w:tbl>"); // no layout tables
  });

  it("only renders photo/DOB/nationality when the style allows", async () => {
    const r = clone(MASTER);
    r.basics.dateOfBirth = "1998-04-02";
    r.basics.nationality = "Indian";
    const hidden = await pdfText((await renderResumePdf({ resume: r, style: US })).buffer);
    expect(hidden).not.toContain("1998-04-02");
    expect(hidden).not.toContain("Indian");
    const shown = await pdfText((await renderResumePdf({ resume: r, style: { ...UK, includeDob: true, includeNationality: true } })).buffer);
    expect(shown).toContain("Date of birth: 1998-04-02");
    expect(shown).toContain("Nationality: Indian");
  });

  it("compact template renders and long resumes paginate", async () => {
    const r = clone(MASTER);
    for (let i = 0; i < 6; i++) r.experience[0]!.bullets.push(...clone(r.experience[0]!.bullets).map((b, k) => ({ ...b, id: `x${i}_${k}`, text: `${b.text} Additional context about stakeholders, delivery and measurable impact for the business.` })));
    const out = await renderResumePdf({ resume: r, style: US, template: "compact" });
    save("long.pdf", out.buffer);
    expect(out.pages).toBeGreaterThanOrEqual(2);
  });
});

describe("style helpers", () => {
  it("formats dates per style", () => {
    expect(formatResumeDate("2024-03", "MMM yyyy")).toBe("Mar 2024");
    expect(formatResumeDate("2024-03", "MM/yyyy")).toBe("03/2024");
    expect(formatResumeDate("2021", "MMM yyyy")).toBe("2021");
  });

  it("orders sections by resume meta, then style, skipping hidden and empty", () => {
    const r = clone(MASTER);
    r.meta = { hiddenSections: ["certifications"], sectionOrder: ["skills", "experience"] };
    expect(orderedSections(r, US)).toEqual(["skills", "experience", "summary", "education", "languages"]);
    expect(sectionHeading("skills", UK)).toBe("Key Skills");
  });

  it("builds slugified file names", () => {
    expect(resumeFileName({ studentName: "Priya Sharma", company: "Acme, Inc.", jobTitle: "Sr. Data Analyst (Remote)", date: new Date("2026-10-12T10:00:00Z") }, "pdf")).toBe("Priya-Sharma_Acme-Inc_Sr-Data-Analyst-Remote_2026-10-12.pdf");
  });
});

describe("resume parsing helpers", () => {
  it("normalises dates", () => {
    expect(toYearMonth("Jan 2020")).toBe("2020-01");
    expect(toYearMonth("September 2019")).toBe("2019-09");
    expect(toYearMonth("03/2021")).toBe("2021-03");
    expect(toYearMonth("2018")).toBe("2018-01");
    expect(toYearMonth("Present")).toBeNull();
  });

  it("heuristic parser extracts contact info and sections into a valid master profile", () => {
    const text = `Priya Sharma
Data Analyst
Austin, TX
priya@example.com | (415) 555-0101 | linkedin.com/in/priya-sharma

SUMMARY
Data analyst with 4 years of experience.

EXPERIENCE
Data Analyst | Northwind Analytics
Feb 2023 - Present
• Built Tableau dashboards that cut reporting time by 35%.
• Optimized SQL pipelines.
Junior Data Analyst, Contoso Retail
Jun 2021 – Jan 2023
- Automated Excel reports with Python.

EDUCATION
University of Texas at Austin
B.S. in Statistics, 2021 GPA: 3.8

SKILLS
Languages: SQL, Python
Tools: Tableau, Excel`;
    const { resume, warnings } = normalizeParsedResume(heuristicParseResume(text), { name: "Fallback", email: "fallback@example.com" });
    expect(resume.basics).toMatchObject({ name: "Priya Sharma", email: "priya@example.com", phone: "(415) 555-0101" });
    expect(resume.basics.links[0]!.url).toBe("https://linkedin.com/in/priya-sharma");
    expect(resume.experience.map((e) => [e.title, e.company, e.startDate, e.endDate])).toEqual([
      ["Data Analyst", "Northwind Analytics", "2023-02", null],
      ["Junior Data Analyst", "Contoso Retail", "2021-06", "2023-01"],
    ]);
    expect(resume.experience[0]!.bullets).toHaveLength(2);
    expect(resume.education[0]).toMatchObject({ institution: "University of Texas at Austin", degree: "B.S.", field: "Statistics", grade: "3.8" });
    expect(resume.skills).toEqual([
      { group: "Languages", items: ["SQL", "Python"] },
      { group: "Tools", items: ["Tableau", "Excel"] },
    ]);
    expect(warnings).toEqual([]);
  });
});
