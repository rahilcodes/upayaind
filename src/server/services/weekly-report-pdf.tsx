import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatInTz } from "@/lib/format";

/**
 * Weekly student report PDF (SPEC F13, D-112): brand band + logo, headline
 * numbers, counts by status, last week's applications table and next week's
 * interviews. Rendered with @react-pdf (same font setup as the invoice PDF).
 */

const LOGO_PATH = path.join(process.cwd(), "public/brand/upayaind-logo.png");
const FONT_DIR = path.join(process.cwd(), "src", "resume", "fonts");
const C = { ink: "#0B1846", royal: "#2563DE", blue: "#2F73F2", sky: "#38B6FF", muted: "#5B6688", border: "#E3E7F0", soft: "#F4F6FB", success: "#1E7B4F" };

export type WeeklyReportData = {
  studentName: string;
  timezone: string;
  locale: string;
  weekStart: Date;
  weekEnd: Date; // exclusive
  generatedAt: Date;
  applications: { companyName: string; jobTitle: string; location: string | null; appliedAt: Date | null; status: string }[];
  countsByStatus: { status: string; label: string; count: number }[];
  interviewsLastWeek: number;
  responseRate: number;
  totalApplications: number;
  nextInterviews: { companyName: string; jobTitle: string; scheduledAt: Date; round: string; mode: string }[];
  statusLabels: Record<string, string>;
  labels: Record<string, string>;
};

let family: string | null = null;
function fontFamily() {
  if (family) return family;
  family = "Helvetica";
  try {
    const f = (n: string) => path.join(FONT_DIR, n);
    if (fs.existsSync(f("Inter-Regular.otf")) && fs.existsSync(f("Inter-Bold.otf")) && fs.existsSync(f("Inter-SemiBold.otf"))) {
      Font.register({
        family: "UpyReport",
        fonts: [
          { src: f("Inter-Regular.otf"), fontWeight: 400 },
          { src: f("Inter-SemiBold.otf"), fontWeight: 600 },
          { src: f("Inter-Bold.otf"), fontWeight: 700 },
        ],
      });
      family = "UpyReport";
    }
  } catch (e) {
    console.error("[weekly-report] font registration failed, using Helvetica", e);
  }
  return family;
}

function ReportDoc({ d, font }: { d: WeeklyReportData; font: string }) {
  const L = d.labels;
  const date = (x: Date, f = "d MMM yyyy") => formatInTz(x, d.timezone, f);
  const bold = font === "Helvetica" ? { fontFamily: "Helvetica-Bold" } : { fontWeight: 700 as const };
  const semi = font === "Helvetica" ? { fontFamily: "Helvetica-Bold" } : { fontWeight: 600 as const };
  const s = StyleSheet.create({
    page: { fontFamily: font, fontSize: 9.5, color: C.ink, paddingTop: 0, paddingBottom: 44, paddingHorizontal: 0 },
    band: { height: 6, flexDirection: "row" },
    body: { paddingHorizontal: 44, paddingTop: 30 },
    row: { flexDirection: "row", justifyContent: "space-between" },
    muted: { color: C.muted },
    h1: { fontSize: 20, ...bold, letterSpacing: -0.3 },
    h2: { fontSize: 12, ...bold, marginTop: 20, marginBottom: 8 },
    label: { fontSize: 7.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3, ...semi },
    stat: { flex: 1, padding: 10, borderLeftWidth: 1, borderColor: C.border },
    statValue: { fontSize: 18, ...bold },
    box: { borderWidth: 1, borderColor: C.border, borderRadius: 8, backgroundColor: C.soft },
    th: { fontSize: 7.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, ...semi, paddingVertical: 5 },
    td: { paddingVertical: 5, borderTopWidth: 1, borderColor: C.border },
    footer: { position: "absolute", bottom: 20, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.muted },
  });
  const cols = { company: "30%", title: "32%", date: "16%", status: "22%" } as const;
  const last = d.weekEnd.getTime() - 1;
  return (
    <Document title={`${L.title} · ${date(d.weekStart)} – ${date(new Date(last))}`} author="UpayaInd" creator="UpayaInd" producer="UpayaInd">
      <Page size={d.locale === "en-US" || d.locale === "en-CA" ? "LETTER" : "A4"} style={s.page}>
        <View style={s.band}>
          <View style={{ flex: 1, backgroundColor: C.royal }} />
          <View style={{ flex: 1, backgroundColor: C.blue }} />
          <View style={{ flex: 1, backgroundColor: C.sky }} />
        </View>
        <View style={s.body}>
          <View style={[s.row, { alignItems: "center" }]}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt; the heading carries the text */}
            <Image src={LOGO_PATH} style={{ width: 110, height: 110 * (69 / 194) }} />
            <View style={{ alignItems: "flex-end" }}>
              <Text style={s.h1}>{L.title}</Text>
              <Text style={[s.muted, { marginTop: 2 }]}>
                {date(d.weekStart)} – {date(new Date(last))}
              </Text>
            </View>
          </View>
          <Text style={{ marginTop: 18, fontSize: 11 }}>{L.greeting}</Text>

          <View style={[s.box, { flexDirection: "row", marginTop: 16 }]}>
            {[
              [L.applications, String(d.applications.length)],
              [L.interviews, String(d.interviewsLastWeek)],
              [L.responseRate, `${d.responseRate}%`],
              [L.total, String(d.totalApplications)],
            ].map(([k, v], i) => (
              <View key={k} style={[s.stat, i === 0 ? { borderLeftWidth: 0 } : {}]}>
                <Text style={s.label}>{k}</Text>
                <Text style={s.statValue}>{v}</Text>
              </View>
            ))}
          </View>

          {d.countsByStatus.length ? (
            <>
              <Text style={s.h2}>{L.byStatus}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {d.countsByStatus.map((c) => (
                  <View key={c.status} style={{ borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, flexDirection: "row", gap: 4 }}>
                    <Text style={semi}>{c.count}</Text>
                    <Text style={s.muted}>{c.label}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          <Text style={s.h2}>{L.applicationsTitle}</Text>
          {d.applications.length ? (
            <View>
              <View style={[s.row, { borderBottomWidth: 1, borderColor: C.border }]}>
                <Text style={[s.th, { width: cols.company }]}>{L.company}</Text>
                <Text style={[s.th, { width: cols.title }]}>{L.role}</Text>
                <Text style={[s.th, { width: cols.date }]}>{L.applied}</Text>
                <Text style={[s.th, { width: cols.status }]}>{L.status}</Text>
              </View>
              {d.applications.map((a, i) => (
                <View key={i} style={s.row} wrap={false}>
                  <Text style={[s.td, { width: cols.company, ...semi }]}>{a.companyName}</Text>
                  <Text style={[s.td, { width: cols.title }]}>
                    {a.jobTitle}
                    {a.location ? ` · ${a.location}` : ""}
                  </Text>
                  <Text style={[s.td, { width: cols.date }]}>{a.appliedAt ? date(a.appliedAt, "EEE d MMM") : "—"}</Text>
                  <Text style={[s.td, { width: cols.status }]}>{d.statusLabels[a.status] ?? a.status}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={s.muted}>{L.noApplications}</Text>
          )}

          <Text style={s.h2}>{L.nextWeek}</Text>
          {d.nextInterviews.length ? (
            d.nextInterviews.map((i, idx) => (
              <View key={idx} style={[s.row, { paddingVertical: 5, borderTopWidth: idx ? 1 : 0, borderColor: C.border }]} wrap={false}>
                <Text style={{ width: "40%", ...semi }}>{date(i.scheduledAt, "EEE d MMM, h:mm a")}</Text>
                <Text style={{ width: "60%" }}>
                  {i.jobTitle} · {i.companyName} ({i.round}, {i.mode})
                </Text>
              </View>
            ))
          ) : (
            <Text style={s.muted}>{L.noInterviews}</Text>
          )}
        </View>
        <View style={s.footer} fixed>
          <Text>{L.footer}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderWeeklyReportPdf(d: WeeklyReportData): Promise<Buffer> {
  const font = fontFamily();
  return Buffer.from(await renderToBuffer(<ReportDoc d={d} font={font} />));
}
