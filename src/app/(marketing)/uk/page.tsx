import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CountryHome } from "@/components/marketing/country-home";
import { pageMetadata } from "@/components/marketing/seo";
import { HOME_LOCALES, HOME_PATHS, homeAlternates } from "@/lib/market";

/**
 * United Kingdom homepage. The middleware serves it at `/` for visitors
 * resolved to UK (D-141); the canonical stays /uk and hreflang links the
 * three country homepages.
 */
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.country.UK.meta");
  return pageMetadata({
    title: t("title"),
    description: t("description"),
    path: HOME_PATHS.UK,
    absoluteTitle: true,
    alternates: homeAlternates(),
    ogLocale: HOME_LOCALES.UK.og,
  });
}

export default function UkHomePage() {
  return <CountryHome market="UK" />;
}
