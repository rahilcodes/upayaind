import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMarketPricing } from "@/components/marketing/data";
import { PricingPageBody } from "@/components/marketing/pricing-page";
import { pageMetadata } from "@/components/marketing/seo";
import { COUNTRY_SEGMENTS, HOME_LOCALES, countryAlternates, countryPath, marketForSegment } from "@/lib/market";

/**
 * Country pricing pages (D-172): /in/pricing, /uk/pricing, /ca/pricing, /au/pricing, /nz/pricing.
 * One indexable page per country with that market's plans and currency only; the US page is /pricing.
 * Static + ISR; unknown segments are a 404.
 */
export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(COUNTRY_SEGMENTS).map((market) => ({ market }));
}

type Props = { params: Promise<{ market: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const market = marketForSegment((await params).market);
  if (!market) return {};
  const [t, tp, pricing] = await Promise.all([getTranslations("marketing.meta"), getTranslations("marketing.pricing"), getMarketPricing(market)]);
  const where = tp(`where.${market}`);
  return pageMetadata({
    title: t("pricingCountryTitle", { where }),
    description: t("pricingCountryDescription", { where, currency: pricing?.market.currency ?? "" }),
    path: countryPath(market, "/pricing"),
    alternates: countryAlternates("/pricing"),
    ogLocale: HOME_LOCALES[market].og,
  });
}

export default async function CountryPricingPage({ params }: Props) {
  const market = marketForSegment((await params).market);
  if (!market) notFound();
  return <PricingPageBody country={market} />;
}
