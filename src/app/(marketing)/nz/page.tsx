import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CountryHome } from "@/components/marketing/country-home";
import { pageMetadata } from "@/components/marketing/seo";
import { HOME_LOCALES, HOME_PATHS, homeAlternates } from "@/lib/market";

/**
 * New Zealand homepage (D-163). The middleware serves it at `/` for visitors
 * resolved to NZ; the canonical stays /nz and hreflang links every
 * country homepage.
 */
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.country.NZ.meta");
  return pageMetadata({
    title: t("title"),
    description: t("description"),
    path: HOME_PATHS.NZ,
    absoluteTitle: true,
    alternates: homeAlternates(),
    ogLocale: HOME_LOCALES.NZ.og,
  });
}

export default function NewZealandHomePage() {
  return <CountryHome market="NZ" />;
}
