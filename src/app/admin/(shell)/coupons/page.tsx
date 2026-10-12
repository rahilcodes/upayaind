import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TicketPercent } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TableWrap, Table, THead, TH, TR, TD } from "@/components/ui/table";
import { integrations } from "@/env";
import { requireRole } from "@/server/auth/guards";
import { listCoupons, listPriceOptions } from "@/server/services/billing";
import { formatDate, formatMoney } from "@/lib/format";
import { CouponDialog, CouponRowActions } from "./coupons-client";

export const metadata: Metadata = { title: "Coupons" };
export const dynamic = "force-dynamic";

export default async function CouponsPage() {
  const user = await requireRole(["ADMIN"]);
  const t = await getTranslations("billing.admin.coupons");
  const tc = await getTranslations("billing.admin.common");
  const ti = await getTranslations("interval");
  const [coupons, prices] = await Promise.all([listCoupons(), listPriceOptions()]);
  const options = prices.map((p) => ({ id: p.id, label: `${p.market.code} · ${p.plan.name} · ${ti(p.interval)} · ${formatMoney(p.amountMinor, p.currency, p.market.locale)}`, isActive: p.isActive }));
  const tz = user.timezone;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={<CouponDialog prices={options} />} />
      {!integrations.stripe ? (
        <p role="status" className="mb-5 rounded-[12px] border border-[#F0D9AE] bg-[#FDF3E1] px-4 py-3 text-sm text-[#5E3C08]">
          {tc("stripeNotConfigured")}
        </p>
      ) : null}
      {coupons.length === 0 ? (
        <EmptyState icon={<TicketPercent className="h-6 w-6" aria-hidden="true" />} title={t("empty")} body={t("emptyBody")} className="bg-surface" />
      ) : (
        <TableWrap>
          <Table className="min-w-[900px]">
            <THead>
              <tr>
                <TH>{t("code")}</TH>
                <TH>{t("discount")}</TH>
                <TH>{t("redemptions")}</TH>
                <TH>{t("validity")}</TH>
                <TH>{t("appliesTo")}</TH>
                <TH>{t("stripe")}</TH>
                <TH>{tc("active")}</TH>
                <TH>
                  <span className="sr-only">{tc("edit")}</span>
                </TH>
              </tr>
            </THead>
            <tbody>
              {coupons.map((c) => {
                const validity =
                  c.validFrom && c.validTo
                    ? t("range", { from: formatDate(c.validFrom, tz), to: formatDate(c.validTo, tz) })
                    : c.validFrom
                      ? t("from", { date: formatDate(c.validFrom, tz) })
                      : c.validTo
                        ? t("until", { date: formatDate(c.validTo, tz) })
                        : t("always");
                const expired = c.validTo ? c.validTo < new Date() : false;
                return (
                  <TR key={c.id} className={!c.isActive || expired ? "text-muted-foreground" : undefined}>
                    <TD>
                      <code className="rounded-[6px] bg-surface-muted px-2 py-1 text-[13px] font-bold text-foreground">{c.code}</code>
                    </TD>
                    <TD className="tabular font-semibold">{c.percentOff ? t("percentOff", { value: c.percentOff }) : formatMoney(c.amountOffMinor ?? 0, c.currency ?? "USD")}</TD>
                    <TD className="tabular">{c.maxRedemptions ? t("redeemedOf", { used: c.redeemed, max: c.maxRedemptions }) : t("redeemedUnlimited", { used: c.redeemed })}</TD>
                    <TD className="text-[13px]">{validity}</TD>
                    <TD className="text-[13px]">{c.planPriceIds.length ? t("someplans", { count: c.planPriceIds.length }) : t("allPlans")}</TD>
                    <TD>{c.providerCouponId ? <Badge tone="green">{t("inStripe")}</Badge> : <Badge tone="grey">{t("notInStripe")}</Badge>}</TD>
                    <TD>
                      <Badge tone={c.isActive ? "green" : "grey"} dot>
                        {c.isActive ? tc("active") : tc("inactive")}
                      </Badge>
                    </TD>
                    <TD>
                      <CouponRowActions coupon={{ ...c, validFrom: c.validFrom?.toISOString() ?? null, validTo: c.validTo?.toISOString() ?? null }} prices={options} stripeReady={integrations.stripe} />
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </>
  );
}
