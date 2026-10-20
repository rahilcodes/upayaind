import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CountryHome } from "@/components/marketing/country-home";
import { pageMetadata } from "@/components/marketing/seo";
import { HOME_LOCALES, HOME_PATHS, homeAlternates } from "@/lib/market";

/**
 * India homepage. The middleware serves it at `/` for visitors
 * resolved to IN (D-141); the canonical stays /in and hreflang links the
 * three country homepages.
 */
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.country.IN.meta");
  return pageMetadata({
    title: t("title"),
    description: t("description"),
    path: HOME_PATHS.IN,
    absoluteTitle: true,
    alternates: homeAlternates(),
    ogLocale: HOME_LOCALES.IN.og,
  });
}

export default function IndiaHomePage() {
  return <CountryHome market="IN" />;
}
