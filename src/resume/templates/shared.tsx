import fs from "node:fs";
import path from "node:path";
import { Document, Font, Image, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ResumeData, SectionKey } from "../schema";
import { contactItems, dateRange, educationLine, formatResumeDate, orderedSections, personalDetails, sectionHeading, type RenderStyle } from "../styles";

/**
 * Shared building blocks for the three ATS-safe templates (SPEC §9.6):
 * single column, real text, no layout tables, headings from the market style.
 *
 * Fonts: react-pdf (fontkit) embeds the static Inter OTFs in src/resume/fonts.
 * The variable Inter woff2 used by the web UI renders blank glyphs in react-pdf,
 * so it can't be used here (docs/DECISIONS.md). If the OTFs are missing at
 * runtime we fall back to the built-in Helvetica.
 */

const FONT_DIR = path.join(process.cwd(), "src", "resume", "fonts");
let fontFamily = "Helvetica";
let fontsReady = false;

export function ensureFonts() {
  if (fontsReady) return fontFamily;
  fontsReady = true;
  try {
    const f = (n: string) => path.join(FONT_DIR, n);
    if (fs.existsSync(f("Inter-Regular.otf")) && fs.existsSync(f("Inter-Bold.otf"))) {
      Font.register({
        family: "Inter",
        fonts: [
          { src: f("Inter-Regular.otf"), fontWeight: 400 },
          { src: f("Inter-Italic.otf"), fontWeight: 400, fontStyle: "italic" },
          { src: f("Inter-SemiBold.otf"), fontWeight: 600 },
          { src: f("Inter-Bold.otf"), fontWeight: 700 },
        ],
      });
      fontFamily = "Inter";
    }
  } catch (e) {
    console.error("[resume] font registration failed, using Helvetica", e);
  }
  // ATS parsers dislike hyphenated words: never hyphenate.
  Font.registerHyphenationCallback((word) => [word]);
  return fontFamily;
}

export type Theme = {
  base: number; // body font size (pt)
  name: number;
  heading: number;
  lineHeight: number;
  margin: number; // page padding (pt)
  sectionGap: number;
  itemGap: number;
  accent: string;
  text: string;
  muted: string;
  rule: string;
  nameAlign: "left" | "center";
  headingStyle: "rule" | "accent" | "caps";
};

export type TemplateProps = {
  resume: ResumeData;
  style: RenderStyle;
  photo?: Buffer | null;
  /** Document metadata title, e.g. "Priya Sharma – Resume". */
  title?: string;
};

function makeStyles(t: Theme, family: string) {
  return StyleSheet.create({
    page: { paddingTop: t.margin, paddingBottom: t.margin, paddingHorizontal: t.margin + 4, fontFamily: family, fontSize: t.base, lineHeight: t.lineHeight, color: t.text },
    header: { marginBottom: t.sectionGap - 2, textAlign: t.nameAlign },
    name: { fontSize: t.name, fontWeight: 700, lineHeight: 1.15, color: t.headingStyle === "accent" ? t.accent : t.text },
    headline: { fontSize: t.base + 1, color: t.muted, marginTop: 2 },
    contact: { marginTop: 4, color: t.muted, fontSize: t.base - 0.5 },
    link: { color: t.muted, textDecoration: "none" },
    section: { marginTop: t.sectionGap },
    heading: {
      fontSize: t.heading,
      fontWeight: 700,
      color: t.headingStyle === "accent" ? t.accent : t.text,
      textTransform: t.headingStyle === "caps" || t.headingStyle === "rule" ? "uppercase" : "none",
      letterSpacing: t.headingStyle === "accent" ? 0.2 : 0.8,
      paddingBottom: 2,
      marginBottom: 4,
      borderBottomWidth: t.headingStyle === "rule" || t.headingStyle === "accent" ? 0.75 : 0,
      borderBottomColor: t.headingStyle === "accent" ? t.accent : t.rule,
    },
    item: { marginBottom: t.itemGap },
    row: { flexDirection: "row", justifyContent: "space-between" },
    strong: { fontWeight: 700 },
    semi: { fontWeight: 600 },
    muted: { color: t.muted },
    italic: { fontStyle: "italic", color: t.muted },
    bulletRow: { flexDirection: "row", marginTop: 1.5, paddingLeft: 2 },
    bulletDot: { width: 9 },
    bulletText: { flex: 1 },
    photo: { width: 64, height: 64, borderRadius: 32, marginBottom: 6, alignSelf: t.nameAlign === "center" ? "center" : "flex-start" },
  });
}

type S = ReturnType<typeof makeStyles>;

function Bullet({ s, children }: { s: S; children: string }) {
  return (
    <View style={s.bulletRow} wrap={false}>
      <Text style={s.bulletDot}>•</Text>
      <Text style={s.bulletText}>{children}</Text>
    </View>
  );
}

function Section({ s, title, children }: { s: S; title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      {/* minPresenceAhead keeps a heading from being orphaned at the bottom of a page */}
      <Text style={s.heading} minPresenceAhead={40}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function renderSection(key: SectionKey, r: ResumeData, style: RenderStyle, s: S) {
  const title = sectionHeading(key, style);
  switch (key) {
    case "summary":
      return (
        <Section key={key} s={s} title={title}>
          <Text>{r.summary}</Text>
        </Section>
      );
    case "skills":
      return (
        <Section key={key} s={s} title={title}>
          {r.skills
            .filter((g) => g.items.length)
            .map((g, i) => (
              <Text key={i} style={{ marginBottom: 1.5 }}>
                <Text style={s.semi}>{g.group}: </Text>
                {g.items.join(", ")}
              </Text>
            ))}
        </Section>
      );
    case "experience":
      return (
        <Section key={key} s={s} title={title}>
          {r.experience.map((e) => (
            <View key={e.id} style={s.item}>
              <View style={s.row} wrap={false}>
                <Text style={[s.strong, { flex: 1 }]}>{e.title}</Text>
                <Text style={s.muted}>{dateRange(e.startDate, e.endDate, style)}</Text>
              </View>
              <View style={s.row} wrap={false}>
                <Text style={[s.semi, { flex: 1 }]}>{e.company}</Text>
                {e.location ? <Text style={s.muted}>{e.location}</Text> : null}
              </View>
              {e.bullets.map((b) => (
                <Bullet key={b.id} s={s}>
                  {b.text}
                </Bullet>
              ))}
            </View>
          ))}
        </Section>
      );
    case "projects":
      return (
        <Section key={key} s={s} title={title}>
          {r.projects.map((p) => (
            <View key={p.id} style={s.item}>
              <Text>
                <Text style={s.strong}>{p.name}</Text>
                {p.link ? <Text style={s.muted}> · {p.link.replace(/^https?:\/\//, "")}</Text> : null}
              </Text>
              {p.description ? <Text>{p.description}</Text> : null}
              {p.bullets.map((b, i) => (
                <Bullet key={i} s={s}>
                  {b}
                </Bullet>
              ))}
            </View>
          ))}
        </Section>
      );
    case "education":
      return (
        <Section key={key} s={s} title={title}>
          {r.education.map((e) => (
            <View key={e.id} style={s.item} wrap={false}>
              <View style={s.row}>
                <Text style={[s.strong, { flex: 1 }]}>{educationLine(e)}</Text>
                <Text style={s.muted}>{e.startDate ? dateRange(e.startDate, e.endDate ?? undefined, style) : formatResumeDate(e.endDate, style.dateFormat)}</Text>
              </View>
              <Text>
                {e.institution}
                {e.grade ? <Text style={s.muted}> · {e.grade}</Text> : null}
              </Text>
            </View>
          ))}
        </Section>
      );
    case "certifications":
      return (
        <Section key={key} s={s} title={title}>
          {r.certifications.map((c, i) => (
            <Text key={i} style={{ marginBottom: 1.5 }}>
              <Text style={s.semi}>{c.name}</Text>
              {c.issuer ? `, ${c.issuer}` : ""}
              {c.date ? <Text style={s.muted}> · {formatResumeDate(c.date, style.dateFormat)}</Text> : null}
            </Text>
          ))}
        </Section>
      );
    case "awards":
      return (
        <Section key={key} s={s} title={title}>
          {r.awards.map((a, i) => (
            <Bullet key={i} s={s}>
              {a}
            </Bullet>
          ))}
        </Section>
      );
    case "languages":
      return (
        <Section key={key} s={s} title={title}>
          <Text>{r.languages.map((l) => `${l.name} (${l.level})`).join(", ")}</Text>
        </Section>
      );
  }
}

export function ResumeDocument({ resume: r, style, photo, title, theme }: TemplateProps & { theme: Theme }) {
  const family = ensureFonts();
  const s = makeStyles(theme, family);
  const contact = contactItems(r, style);
  const personal = personalDetails(r, style);
  const docTitle = title ?? `${r.basics.name} – ${style.documentTitle}`;
  return (
    <Document title={docTitle} author={r.basics.name} subject={style.documentTitle} keywords={style.documentTitle} creator="UpayaInd" producer="UpayaInd" language={style.spelling}>
      <Page size={style.pageSize === "A4" ? "A4" : "LETTER"} style={s.page}>
        <View style={s.header}>
          {/* react-pdf Image has no alt; the photo is decorative */}
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          {style.includePhoto && photo ? <Image style={s.photo} src={{ data: photo, format: "jpg" }} /> : null}
          <Text style={s.name}>{r.basics.name}</Text>
          {r.basics.headline ? <Text style={s.headline}>{r.basics.headline}</Text> : null}
          <Text style={s.contact}>
            {contact.map((c, i) => (
              <Text key={i}>
                {i > 0 ? "  |  " : ""}
                {c.href ? (
                  <Link src={c.href} style={s.link}>
                    {c.text}
                  </Link>
                ) : (
                  c.text
                )}
              </Text>
            ))}
          </Text>
          {personal.length ? <Text style={s.contact}>{personal.map((p) => `${p.label}: ${p.value}`).join("  |  ")}</Text> : null}
        </View>
        {orderedSections(r, style).map((k) => renderSection(k, r, style, s))}
      </Page>
    </Document>
  );
}
