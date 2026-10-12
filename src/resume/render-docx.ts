import "server-only";
import { AlignmentType, BorderStyle, Document, ExternalHyperlink, LevelFormat, Packer, Paragraph, TabStopType, TextRun } from "docx";
import type { ResumeData, SectionKey } from "./schema";
import { PAGE, asTemplate, contactItems, dateRange, educationLine, formatResumeDate, orderedSections, personalDetails, sectionHeading, type RenderStyle } from "./styles";

/**
 * DOCX renderer mirroring the PDF templates (SPEC §9.6): one column, real
 * paragraphs, Word bullet lists (not "•" characters), right-aligned dates via a
 * tab stop (no tables), headings from the market style.
 */

type DocxTheme = { font: string; base: number; name: number; heading: number; accent: string; muted: string; center: boolean; caps: boolean; rule: boolean; marginTwip: number };

const THEMES: Record<string, DocxTheme> = {
  classic: { font: "Calibri", base: 10.5, name: 20, heading: 11, accent: "0B1846", muted: "4A5578", center: true, caps: true, rule: true, marginTwip: 820 },
  modern: { font: "Calibri", base: 10.5, name: 22, heading: 12, accent: "0A35D6", muted: "4A5578", center: false, caps: false, rule: true, marginTwip: 860 },
  compact: { font: "Calibri", base: 9.5, name: 17, heading: 10, accent: "0B1846", muted: "4A5578", center: false, caps: true, rule: false, marginTwip: 620 },
};

const hp = (pt: number) => Math.round(pt * 2); // docx sizes are half-points

export async function renderResumeDocx(input: { resume: ResumeData; style: RenderStyle; template?: string | null; title?: string }): Promise<Buffer> {
  const r = input.resume;
  const style = input.style;
  const t = THEMES[asTemplate(input.template)]!;
  const page = PAGE[style.pageSize];
  const contentWidth = page.widthTwip - 2 * t.marginTwip;
  const rightTab = [{ type: TabStopType.RIGHT, position: contentWidth }];

  const run = (text: string, o: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {}) =>
    new TextRun({ text, bold: o.bold, italics: o.italics, color: o.color, size: o.size ? hp(o.size) : undefined, font: t.font });

  const heading = (key: SectionKey) =>
    new Paragraph({
      spacing: { before: 200, after: 80 },
      keepNext: true,
      border: t.rule ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: t.accent === "0A35D6" ? "0A35D6" : "9AA3BA", space: 2 } } : undefined,
      children: [run(t.caps ? sectionHeading(key, style).toUpperCase() : sectionHeading(key, style), { bold: true, size: t.heading, color: t.accent })],
    });

  const bullet = (text: string) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 30 }, children: [run(text)] });

  const twoCol = (left: TextRun[], right: string, opts: { keepNext?: boolean } = {}) =>
    new Paragraph({ tabStops: rightTab, keepNext: opts.keepNext, keepLines: true, spacing: { after: 0 }, children: [...left, ...(right ? [run(`\t${right}`, { color: t.muted })] : [])] });

  const children: Paragraph[] = [];

  // Header
  children.push(
    new Paragraph({ alignment: t.center ? AlignmentType.CENTER : AlignmentType.LEFT, spacing: { after: 40 }, children: [run(r.basics.name, { bold: true, size: t.name, color: t.accent === "0A35D6" ? t.accent : "0B1846" })] }),
  );
  if (r.basics.headline) children.push(new Paragraph({ alignment: t.center ? AlignmentType.CENTER : AlignmentType.LEFT, spacing: { after: 40 }, children: [run(r.basics.headline, { color: t.muted, size: t.base + 1 })] }));
  const contact = contactItems(r, style);
  const contactRuns: (TextRun | ExternalHyperlink)[] = [];
  contact.forEach((c, i) => {
    if (i > 0) contactRuns.push(run("  |  ", { color: t.muted }));
    if (c.href) contactRuns.push(new ExternalHyperlink({ link: c.href, children: [run(c.text, { color: t.muted })] }));
    else contactRuns.push(run(c.text, { color: t.muted }));
  });
  children.push(new Paragraph({ alignment: t.center ? AlignmentType.CENTER : AlignmentType.LEFT, spacing: { after: 60 }, children: contactRuns }));
  const personal = personalDetails(r, style);
  if (personal.length) children.push(new Paragraph({ alignment: t.center ? AlignmentType.CENTER : AlignmentType.LEFT, children: [run(personal.map((p) => `${p.label}: ${p.value}`).join("  |  "), { color: t.muted })] }));

  for (const key of orderedSections(r, style)) {
    children.push(heading(key));
    switch (key) {
      case "summary":
        children.push(new Paragraph({ children: [run(r.summary ?? "")] }));
        break;
      case "skills":
        for (const g of r.skills.filter((g) => g.items.length)) children.push(new Paragraph({ spacing: { after: 30 }, children: [run(`${g.group}: `, { bold: true }), run(g.items.join(", "))] }));
        break;
      case "experience":
        for (const e of r.experience) {
          children.push(twoCol([run(e.title, { bold: true })], dateRange(e.startDate, e.endDate, style), { keepNext: true }));
          children.push(twoCol([run(e.company)], e.location ?? "", { keepNext: true }));
          for (const b of e.bullets) children.push(bullet(b.text));
          children.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
        }
        break;
      case "projects":
        for (const p of r.projects) {
          children.push(new Paragraph({ keepNext: true, children: [run(p.name, { bold: true }), ...(p.link ? [run(` · ${p.link.replace(/^https?:\/\//, "")}`, { color: t.muted })] : [])] }));
          if (p.description) children.push(new Paragraph({ children: [run(p.description)] }));
          for (const b of p.bullets) children.push(bullet(b));
        }
        break;
      case "education":
        for (const e of r.education) {
          children.push(twoCol([run(educationLine(e), { bold: true })], e.startDate ? dateRange(e.startDate, e.endDate ?? undefined, style) : formatResumeDate(e.endDate, style.dateFormat), { keepNext: true }));
          children.push(new Paragraph({ spacing: { after: 60 }, children: [run(e.institution), ...(e.grade ? [run(` · ${e.grade}`, { color: t.muted })] : [])] }));
        }
        break;
      case "certifications":
        for (const c of r.certifications) children.push(new Paragraph({ children: [run(c.name, { bold: true }), run(c.issuer ? `, ${c.issuer}` : ""), ...(c.date ? [run(` · ${formatResumeDate(c.date, style.dateFormat)}`, { color: t.muted })] : [])] }));
        break;
      case "awards":
        for (const a of r.awards) children.push(bullet(a));
        break;
      case "languages":
        children.push(new Paragraph({ children: [run(r.languages.map((l) => `${l.name} (${l.level})`).join(", "))] }));
        break;
    }
  }

  const doc = new Document({
    creator: "UpayaInd",
    title: input.title ?? `${r.basics.name} – ${style.documentTitle}`,
    subject: style.documentTitle,
    styles: { default: { document: { run: { font: t.font, size: hp(t.base), language: { value: style.spelling } }, paragraph: { spacing: { line: 264 } } } } },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 300, hanging: 200 } } } }],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: page.widthTwip, height: page.heightTwip },
            margin: { top: t.marginTwip, bottom: t.marginTwip, left: t.marginTwip, right: t.marginTwip },
          },
        },
        children,
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
