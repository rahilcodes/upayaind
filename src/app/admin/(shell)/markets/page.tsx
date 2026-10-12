import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Globe } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TableWrap, Table, THead, TH, TR, TD } from "@/components/ui/table";
import { requireRole } from "@/server/auth/guards";
import { listMarketsAdmin } from "@/server/services/billing";
import { formatMoney } from "@/lib/format";
import { MarketDialog } from "./market-dialog";

export const metadata: Metadata = { title: "Markets" };
export const dynamic = "force-dynamic";

export default async function MarketsPage() {
  await requireRole(["ADMIN"]);
  const t = await getTranslations("billing.admin.markets");
  const tc = await getTranslations("billing.admin.common");
  const { markets, styles } = await listMarketsAdmin();

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={<MarketDialog styles={styles} />} />
      {markets.length === 0 ? (
        <EmptyState icon={<Globe className="h-6 w-6" aria-hidden="true" />} title={t("empty")} body={t("emptyBody")} className="bg-surface" />
      ) : (
        <TableWrap>
          <Table className="min-w-[1100px]">
            <THead>
              <tr>
                <TH>{t("form.name")}</TH>
                <TH>{t("form.currency")}</TH>
                <TH>{t("minPrice")}</TH>
                <TH>{t("timezone")}</TH>
                <TH>{t("workingDays")}</TH>
                <TH>{t("provider")}</TH>
                <TH>{t("resumeStyle")}</TH>
                <TH>{t("contact")}</TH>
                <TH>
                  <span className="sr-only">{tc("edit")}</span>
                </TH>
              </tr>
            </THead>
            <tbody>
              {markets.map((m) => (
                <TR key={m.id}>
                  <TD>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 w-10 items-center justify-center rounded-[8px] bg-surface-muted text-[13px] font-bold">{m.code}</span>
                      <div className="min-w-[150px]">
                        <p className="flex items-center gap-2 font-semibold">
                          {m.name}
                          <Badge tone={m.isActive ? "green" : "grey"} dot>
                            {m.isActive ? tc("active") : tc("inactive")}
                          </Badge>
                        </p>
                        <p className="text-[12px] text-muted-foreground">
                          {t("students", { count: m._count.students })} · {t("prices", { count: m._count.plans })}
                        </p>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <span className="font-semibold">{m.currency}</span>
                    <span className="block text-[12px] text-muted-foreground">{m.locale}</span>
                  </TD>
                  <TD className="tabular font-semibold">{formatMoney(m.minPriceMinor, m.currency, m.locale)}</TD>
                  <TD className="text-[13px]">{m.defaultTimezone}</TD>
                  <TD className="text-[13px]">{m.workingDays.map((d) => t(`weekday.${d}` as "weekday.1")).join(", ")}</TD>
                  <TD>
                    <Badge tone={m.paymentProvider === "STRIPE" ? "blue" : "amber"}>{t(`providerName.${m.paymentProvider as "STRIPE"}`)}</Badge>
                  </TD>
                  <TD className="text-[13px]">{m.resumeStyle.name}</TD>
                  <TD className="whitespace-nowrap text-[13px]">
                    {m.phoneDisplay ?? <span className="text-muted-foreground">{tc("notSet")}</span>}
                    {m.whatsapp ? <span className="block text-[12px] text-muted-foreground">WhatsApp {m.whatsapp}</span> : null}
                  </TD>
                  <TD>
                    <div className="flex justify-end">
                      <MarketDialog styles={styles} market={m} />
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </>
  );
}
