import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CountryHome } from "@/components/marketing/country-home";
import { pageMetadata } from "@/components/marketing/seo";
import { HOME_LOCALES, HOME_PATHS, homeAlternates } from "@/lib/market";

/**
 * Canada homepage (D-163). The middleware serves it at `/` for visitors
 * resolved to CA; the canonical stays /ca and hreflang links every
 * country homepage.
 */
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.country.CA.meta");
  return pageMetadata({
    title: t("title"),
    description: t("description"),
    path: HOME_PATHS.CA,
    absoluteTitle: true,
    alternates: homeAlternates(),
    ogLocale: HOME_LOCALES.CA.og,
  });
}

export default function CanadaHomePage() {
  return <CountryHome market="CA" />;
}
