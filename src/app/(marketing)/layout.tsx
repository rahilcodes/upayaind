import { getMessages, getTranslations } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { CORE_NAMESPACES, pickMessages } from "@/i18n/messages";
import Link from "next/link";
import { env } from "@/env";
import { Analytics } from "@/components/marketing/analytics";
import { SiteFooter, SiteHeader } from "@/components/marketing/chrome";
import { getActiveMarkets, getPublicSite } from "@/components/marketing/data";
import { JsonLd, organizationLd } from "@/components/marketing/json-ld";
import { MarketScript, MarketStyle } from "@/components/marketing/market";
import { listPublished } from "@/server/services/cms";
import "@/components/marketing/prose.css";

/**
 * Public website shell (SPEC §6.1). Light only (no `.portal`), statically
 * generated with ISR; CMS saves revalidate on demand.
 */
export const revalidate = 3600;

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const [t, markets, legal, site] = await Promise.all([getTranslations("marketing"), getActiveMarkets(), listPublished("LEGAL"), getPublicSite()]);
  const messages = pickMessages(await getMessages(), [...CORE_NAMESPACES, "marketing"]);
  const codes = markets.map((m) => m.code);
  const legalSlugs = new Set(legal.map((l) => l.slug));
  return (
    <NextIntlClientProvider messages={messages}>
    <div id="mk-root" suppressHydrationWarning className="flex min-h-dvh flex-col bg-paper text-[16px] leading-[1.55] text-ink">
      <MarketStyle codes={codes} />
      <MarketScript codes={codes} />
      <a href="#main" className="sr-only z-[60] rounded-md bg-royal px-4 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        {t("nav.skip")}
      </a>
      <SiteHeader markets={markets} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter markets={markets} legal={legalSlugs} site={site} />
      <JsonLd data={organizationLd({ phones: markets.flatMap((m) => (m.phoneDisplay ? [{ phone: m.phoneDisplay, country: m.code }] : [])), email: site.contactEmail, address: site.address })} />
      <Analytics
        gaId={env.NEXT_PUBLIC_GA_ID}
        clarityId={env.NEXT_PUBLIC_CLARITY_ID}
        copy={{
          title: t("consent.title"),
          label: t("consent.label"),
          accept: t("consent.accept"),
          reject: t("consent.reject"),
          body: legalSlugs.has("cookies")
            ? t.rich("consent.body", {
                link: (c) => (
                  <Link href="/legal/cookies" className="font-semibold text-royal underline underline-offset-2">
                    {c}
                  </Link>
                ),
              })
            : t("consent.bodyNoLink"),
        }}
      />
    </div>
    </NextIntlClientProvider>
  );
}
