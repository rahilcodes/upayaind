import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Globe, Tag } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { integrations } from "@/env";
import { requireRole } from "@/server/auth/guards";
import { getPlansMatrix } from "@/server/services/billing";
import { PlanDialog, PlansMatrix } from "./plans-client";

export const metadata: Metadata = { title: "Plans & pricing" };
export const dynamic = "force-dynamic";

export default async function PlansPage() {
  await requireRole(["ADMIN"]);
  const t = await getTranslations("billing.admin.plans");
  const tcm = await getTranslations("billing.admin.common");
  const data = await getPlansMatrix();

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={<PlanDialog mode="create" />} />
      {!integrations.stripe ? (
        <p role="status" className="mb-5 rounded-[12px] border border-[#F0D9AE] bg-[#FDF3E1] px-4 py-3 text-sm text-[#5E3C08]">
          {tcm("stripeNotConfigured")}
        </p>
      ) : null}
      {data.markets.length === 0 ? (
        <EmptyState icon={<Globe className="h-6 w-6" aria-hidden="true" />} title={t("noMarkets")} body={t("noMarketsBody")} className="bg-surface" />
      ) : data.plans.length === 0 ? (
        <EmptyState icon={<Tag className="h-6 w-6" aria-hidden="true" />} title={t("noPlans")} body={t("noPlansBody")} className="bg-surface" />
      ) : (
        <PlansMatrix plans={data.plans} markets={data.markets} intervals={data.intervals} stripeReady={integrations.stripe} />
      )}
    </>
  );
}
