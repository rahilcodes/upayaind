import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PricingPageBody } from "@/components/marketing/pricing-page";
import { pageMetadata } from "@/components/marketing/seo";
import { HOME_LOCALES, countryAlternates } from "@/lib/market";

/**
 * /pricing (SPEC §6.3). Static + ISR: every active market's plans are
 * rendered and the visitor's market (cookie / ?market=) is shown via CSS
 * (see components/marketing/market.tsx). Prices come from Plan + PlanPrice.
 * Each other country also has its own indexable page (/uk/pricing …, D-172);
 * this one is the US and x-default member of that hreflang set.
 */
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.meta");
  return pageMetadata({
    title: t("pricingTitleAll"),
    description: t("pricingDescriptionAll"),
    path: "/pricing",
    alternates: countryAlternates("/pricing"),
    ogLocale: HOME_LOCALES.US.og,
  });
}

export default function PricingPage() {
  return <PricingPageBody />;
}
