import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Document, Font, Page, StyleSheet, Svg, Path, Rect, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { createTranslator } from "next-intl";
import billingMessages from "@/i18n/messages/en/billing.json";
import { formatMoney, formatInTz } from "@/lib/format";

/**
 * Invoice PDF (SPEC M2): brand styling, business details per market
 * (Settings → business[marketCode]), tax line. Rendered with @react-pdf.
 */

export type InvoiceData = {
  invoiceNumber: string;
  issuedAt: Date;
  timezone: string;
  locale: string;
  currency: string;
  business: { legalName: string; address: string; taxId: string };
  customer: { name: string; email: string };
  line: { description: string; periodStart: Date | null; periodEnd: Date | null; amountMinor: number };
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  status: "PAID" | "REFUNDED" | "PARTIALLY_REFUNDED";
  paymentRef?: string | null;
};

const C = { ink: "#0B1846", royal: "#0A35D6", blue: "#0A7CF0", sky: "#18B8F2", muted: "#5B6688", border: "#E3E7F0", soft: "#F4F6FB", success: "#1E7B4F" };

const FONT_DIR = path.join(process.cwd(), "src", "resume", "fonts");
let family: string | null = null;
function fontFamily() {
  if (family) return family;
  family = "Helvetica";
  try {
    const f = (n: string) => path.join(FONT_DIR, n);
    if (fs.existsSync(f("Inter-Regular.otf")) && fs.existsSync(f("Inter-Bold.otf")) && fs.existsSync(f("Inter-SemiBold.otf"))) {
      Font.register({
        family: "UpyInvoice",
        fonts: [
          { src: f("Inter-Regular.otf"), fontWeight: 400 },
          { src: f("Inter-SemiBold.otf"), fontWeight: 600 },
          { src: f("Inter-Bold.otf"), fontWeight: 700 },
        ],
      });
      family = "UpyInvoice";
    }
  } catch (e) {
    console.error("[invoice] font registration failed, using Helvetica", e);
  }
  return family;
}

function InvoiceDoc({ d, font }: { d: InvoiceData; font: string }) {
  const t = createTranslator({ locale: "en", messages: billingMessages, namespace: "billing.invoicePdf" });
  const money = (n: number) => formatMoney(n, d.currency, d.locale);
  const date = (x: Date) => formatInTz(x, d.timezone, "d MMM yyyy");
  const bold = font === "Helvetica" ? { fontFamily: "Helvetica-Bold" } : { fontWeight: 700 as const };
  const semi = font === "Helvetica" ? { fontFamily: "Helvetica-Bold" } : { fontWeight: 600 as const };
  const s = StyleSheet.create({
    page: { fontFamily: font, fontSize: 10, color: C.ink, paddingTop: 0, paddingBottom: 48, paddingHorizontal: 0 },
    band: { height: 6, flexDirection: "row" },
    body: { paddingHorizontal: 48, paddingTop: 36 },
    row: { flexDirection: "row", justifyContent: "space-between" },
    muted: { color: C.muted },
    h1: { fontSize: 24, ...bold, letterSpacing: -0.3 },
    label: { fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4, ...semi },
    box: { borderWidth: 1, borderColor: C.border, borderRadius: 8 },
    th: { fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, ...semi },
    totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  });
  const statusLabel = t(`status.${d.status}`);
  return (
    <Document title={`${t("title")} ${d.invoiceNumber}`} author={d.business.legalName || "UpayaInd"} creator="UpayaInd" producer="UpayaInd">
      <Page size={d.locale === "en-US" || d.locale === "en-CA" ? "LETTER" : "A4"} style={s.page}>
        <View style={s.band}>
          <View style={{ flex: 1, backgroundColor: C.royal }} />
          <View style={{ flex: 1, backgroundColor: C.blue }} />
          <View style={{ flex: 1, backgroundColor: C.sky }} />
        </View>
        <View style={s.body}>
          <View style={s.row}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Svg width={30} height={30} viewBox="0 0 34 34">
                <Rect width={34} height={34} rx={9} fill={C.ink} />
                <Path d="M8 24 L14 18 L18 21 L26 11" fill="none" stroke={C.sky} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                <Path d="M20 11 H26 V17" fill="none" stroke={C.sky} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
              <Text style={{ fontSize: 16, marginLeft: 8, ...bold }}>UpayaInd</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={s.h1}>{t("title")}</Text>
              <Text style={[s.muted, { marginTop: 2 }]}>{d.invoiceNumber}</Text>
            </View>
          </View>

          <View style={[s.row, { marginTop: 32 }]}>
            <View style={{ width: "48%" }}>
              <Text style={s.label}>{t("from")}</Text>
              <Text style={semi}>{d.business.legalName || "UpayaInd"}</Text>
              {d.business.address ? <Text style={[s.muted, { marginTop: 2, lineHeight: 1.4 }]}>{d.business.address}</Text> : null}
              {d.business.taxId ? <Text style={[s.muted, { marginTop: 2 }]}>{t("taxId", { id: d.business.taxId })}</Text> : null}
            </View>
            <View style={{ width: "48%" }}>
              <Text style={s.label}>{t("billTo")}</Text>
              <Text style={semi}>{d.customer.name}</Text>
              <Text style={[s.muted, { marginTop: 2 }]}>{d.customer.email}</Text>
            </View>
          </View>

          <View style={[s.box, { flexDirection: "row", marginTop: 24, backgroundColor: C.soft }]}>
            {[
              [t("issued"), date(d.issuedAt)],
              [t("number"), d.invoiceNumber],
              [t("statusLabel"), statusLabel],
              [t("currency"), d.currency.toUpperCase()],
            ].map(([k, v], i) => (
              <View key={k} style={{ flex: 1, padding: 12, borderLeftWidth: i ? 1 : 0, borderColor: C.border }}>
                <Text style={s.label}>{k}</Text>
                <Text style={[semi, i === 2 ? { color: d.status === "PAID" ? C.success : C.muted } : {}]}>{v}</Text>
              </View>
            ))}
          </View>

          <View style={[s.box, { marginTop: 24 }]}>
            <View style={[s.row, { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderColor: C.border }]}>
              <Text style={s.th}>{t("description")}</Text>
              <Text style={s.th}>{t("amount")}</Text>
            </View>
            <View style={[s.row, { paddingHorizontal: 14, paddingVertical: 12 }]}>
              <View style={{ width: "70%" }}>
                <Text style={semi}>{d.line.description}</Text>
                {d.line.periodStart && d.line.periodEnd ? (
                  <Text style={[s.muted, { marginTop: 3 }]}>{t("servicePeriod", { from: date(d.line.periodStart), to: date(d.line.periodEnd) })}</Text>
                ) : null}
              </View>
              <Text style={semi}>{money(d.line.amountMinor)}</Text>
            </View>
          </View>

          <View style={{ marginTop: 16, marginLeft: "auto", width: "45%" }}>
            <View style={s.totalRow}>
              <Text style={s.muted}>{t("subtotal")}</Text>
              <Text>{money(d.line.amountMinor)}</Text>
            </View>
            {d.discountMinor > 0 ? (
              <View style={s.totalRow}>
                <Text style={s.muted}>{t("discount")}</Text>
                <Text>−{money(d.discountMinor)}</Text>
              </View>
            ) : null}
            <View style={s.totalRow}>
              <Text style={s.muted}>{t("tax")}</Text>
              <Text>{money(d.taxMinor)}</Text>
            </View>
            <View style={[s.totalRow, { borderTopWidth: 1, borderColor: C.ink, marginTop: 4, paddingTop: 8 }]}>
              <Text style={bold}>{t("totalPaid")}</Text>
              <Text style={bold}>{money(d.totalMinor)}</Text>
            </View>
          </View>

          {d.paymentRef ? <Text style={[s.muted, { marginTop: 24, fontSize: 8 }]}>{t("paymentRef", { ref: d.paymentRef })}</Text> : null}
          <Text style={[s.muted, { marginTop: d.paymentRef ? 6 : 24, fontSize: 9, lineHeight: 1.5 }]}>{t("thanks")}</Text>
          <Text style={[semi, { fontSize: 9, color: C.royal }]} hyphenationCallback={(w) => [w]}>
            {t("supportEmail")}
          </Text>
        </View>
        <Text style={{ position: "absolute", bottom: 24, left: 48, right: 48, fontSize: 8, color: C.muted, textAlign: "center" }} fixed>
          {t("footer")}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(d: InvoiceData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDoc d={d} font={fontFamily()} />);
}
