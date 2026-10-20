import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CountryHome } from "@/components/marketing/country-home";
import { pageMetadata } from "@/components/marketing/seo";
import { HOME_LOCALES, HOME_PATHS, homeAlternates } from "@/lib/market";

/**
 * Homepage (US copy). Visitors resolved to IN or UK are rewritten by the
 * middleware to /in or /uk while the URL stays `/` (D-141); every other
 * country gets this page. Static + ISR, no cookies()/headers() (D-034).
 */
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.country.US.meta");
  return pageMetadata({
    title: t("title"),
    description: t("description"),
    path: HOME_PATHS.US,
    absoluteTitle: true,
    alternates: homeAlternates(),
    ogLocale: HOME_LOCALES.US.og,
  });
}

export default function HomePage() {
  return <CountryHome market="US" />;
}
