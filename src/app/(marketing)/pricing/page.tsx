import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { absoluteUrl } from "@/lib/utils";
import { getActiveMarkets, getAllPricing, htmlToText, type MarketPricing } from "@/components/marketing/data";
import { JsonLd, ORG_ID, faqLd } from "@/components/marketing/json-ld";
import { PerMarket } from "@/components/marketing/market";
import { ComparisonTable, PricingTable } from "@/components/marketing/pricing";
import { FaqList, FinalCta } from "@/components/marketing/sections";
import { pageMetadata } from "@/components/marketing/seo";
import { H2, PageHero, Section, TextLink } from "@/components/marketing/ui";
import { getPublished } from "@/server/services/cms";
import { env } from "@/env";

/**
 * /pricing (SPEC §6.3). Static + ISR: every active market's plans are
 * rendered and the visitor's market (cookie / ?market=) is shown via CSS
 * (see components/marketing/market.tsx). Prices come from Plan + PlanPrice.
 */
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const [t, markets] = await Promise.all([getTranslations("marketing.meta"), getActiveMarkets()]);
  const m = markets[0];
  return pageMetadata({
    title: markets.length > 1 || !m ? t("pricingTitleAll") : t("pricingTitle", { country: m.name }),
    description: markets.length > 1 || !m ? t("pricingDescriptionAll") : t("pricingDescription", { currency: m.currency }),
    path: "/pricing",
  });
}

function serviceLd(all: MarketPricing[]) {
  const offers = all.flatMap((p) =>
    p.plans.flatMap((plan) =>
      plan.prices
        .filter((x) => x.purchasable)
        .map((x) => ({
          "@type": "Offer",
          name: `${plan.name} (${x.interval.toLowerCase().replace("_", "-")})`,
          price: (x.amountMinor / 100).toFixed(2),
          priceCurrency: x.currency,
          eligibleRegion: { "@type": "Country", name: p.market.name },
          availability: "https://schema.org/InStock",
          url: absoluteUrl(`/signup?plan=${x.id}`),
          description: `${x.dailyTarget} tailored applications every weekday`,
        })),
    ),
  );
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "UpayaInd done-for-you job applications",
    serviceType: "Job application service",
    description: "Specialists apply to jobs for you every weekday, each with a resume tailored to the job description. Track every application live.",
    provider: { "@id": ORG_ID },
    areaServed: all.map((p) => ({ "@type": "Country", name: p.market.name })),
    ...(offers.length ? { offers } : {}),
  };
}

export default async function PricingPage() {
  const [t, markets, guarantee] = await Promise.all([getTranslations("marketing"), getActiveMarkets(), getPublished("LEGAL", "guarantee")]);
  const all = await getAllPricing(markets);
  const faq = t.raw("pricing.faq") as { q: string; a: string }[];
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const guaranteeText = guarantee ? guarantee.excerpt || htmlToText(guarantee.bodyHtml).split("\n")[0] : null;

  return (
    <>
      <PageHero
        eyebrow={t("pricing.eyebrow")}
        title={t("pricing.pageTitle")}
        sub={
          <PerMarket items={markets} as="span">
            {(m) => t("pricing.pageSub", { currency: m.currency, country: m.name })}
          </PerMarket>
        }
        className="pb-6 text-center sm:pb-8 [&_h1]:mx-auto [&_p]:mx-auto"
      />

      <section aria-labelledby="plans-title" className="bg-paper px-4 pb-16 sm:px-6 sm:pb-20">
        <h2 id="plans-title" className="sr-only">
          {t("pricing.compareTitle")}
        </h2>
        <div className="mx-auto max-w-[1200px]">
          <PerMarket items={all.map((p) => ({ code: p.market.code, p }))}>
            {({ p }) =>
              p.plans.length ? (
                <PricingTable pricing={p} />
              ) : (
                <div className="mx-auto max-w-[560px] rounded-[20px] border border-sand bg-white p-8 text-center">
                  <p className="text-[#3E4A6E]">{t("pricing.noPlans", { country: p.market.name })}</p>
                  <Link href="/contact" className="mt-5 inline-flex min-h-11 items-center rounded-[10px] bg-royal px-5 font-semibold text-white">
                    {t("pricing.contactUs")}
                  </Link>
                </div>
              )
            }
          </PerMarket>
          <p className="mt-8 text-center text-sm text-[#5A6585]">{t("pricing.noLoginWall")}</p>
        </div>
      </section>

      <Section tone="white" labelledBy="compare-title">
        <H2 id="compare-title" className="mb-8">
          {t("pricing.compareTitle")}
        </H2>
        <PerMarket items={all.map((p) => ({ code: p.market.code, p }))}>{({ p }) => <ComparisonTable pricing={p} />}</PerMarket>
      </Section>

      {guarantee ? (
        <Section labelledBy="guarantee-title" inner="max-w-[820px]">
          <div className="relative overflow-hidden rounded-[22px] brand-deep p-8 text-white sm:p-10">
            <div aria-hidden="true" className="brand-gradient absolute inset-x-0 top-0 h-1" />
            <H2 id="guarantee-title" className="mb-4 text-[30px] sm:text-[34px] lg:text-[38px]">
              {guarantee.title || t("pricing.guaranteeTitle")}
            </H2>
            {guaranteeText ? <p className="mb-6 text-lg text-[#EEF4FF]">{guaranteeText}</p> : null}
            <Link href="/legal/guarantee" className="inline-flex min-h-11 items-center font-semibold text-[#FFFFFF] underline underline-offset-4 hover:text-white">
              {t("pricing.guaranteeLink")}
            </Link>
          </div>
        </Section>
      ) : null}

      <Section tone="white" labelledBy="pricing-faq-title" inner="max-w-[820px]">
        <H2 id="pricing-faq-title" className="mb-8 text-center">
          {t("pricing.faqTitle")}
        </H2>
        <FaqList items={faq.map((f) => ({ q: f.q, html: `<p>${escape(f.a)}</p>` }))} />
        <p className="mt-8 text-center">
          <TextLink href="/faq" className="inline-flex min-h-11 items-center">
            {t("faq.seeAll")}
          </TextLink>
        </p>
      </Section>

      <FinalCta calcom={Boolean(env.CALCOM_LINK)} />
      <JsonLd data={[serviceLd(all), faqLd(faq)]} />
    </>
  );
}

