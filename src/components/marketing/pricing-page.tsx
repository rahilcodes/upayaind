import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { env } from "@/env";
import { HOME_MARKETS, HOME_PATHS, countryPath, type HomeMarket } from "@/lib/market";
import { getPublished } from "@/server/services/cms";
import { getActiveMarkets, getAllPricing, hasPurchasablePlan, htmlToText, type MarketInfo } from "./data";
import { JsonLd, breadcrumbLd, faqLd, serviceLd } from "./json-ld";
import { MarketPin, PerMarket } from "./market";
import { ComparisonTable, PricingTable } from "./pricing";
import { FaqList, FinalCta } from "./sections";
import { H2, PageHero, Section, TextLink } from "./ui";

/**
 * Pricing page body (SPEC §6.3), shared by `/pricing` and the country pages (D-172).
 *
 * - `/pricing` (no `country`): every active market is rendered and CSS shows the
 *   visitor's market, so the page stays static.
 * - `/uk/pricing` etc. (`country` set): only that market, pinned, with its own
 *   H1, breadcrumb and Offer structured data in one currency, so search engines
 *   have one indexable pricing page per country.
 */
export async function PricingPageBody({ country }: { country?: HomeMarket }) {
  const [t, active, guarantee] = await Promise.all([getTranslations("marketing"), getActiveMarkets(), getPublished("LEGAL", "guarantee")]);
  const markets: MarketInfo[] = country ? active.filter((m) => m.code === country) : active;
  const all = await getAllPricing(markets);
  const faq = t.raw("pricing.faq") as { q: string; a: string }[];
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const guaranteeText = guarantee ? guarantee.excerpt || htmlToText(guarantee.bodyHtml).split("\n")[0] : null;
  const path = countryPath(country ?? "US", "/pricing");
  // Plain links between the country pricing pages, so the hreflang set is also reachable by crawling.
  const others = HOME_MARKETS.flatMap((m) => {
    const info = active.find((a) => a.code === m);
    return info && m !== (country ?? "US") ? [{ code: m, href: countryPath(m, "/pricing"), info }] : [];
  });

  return (
    <>
      {country ? <MarketPin code={country} /> : null}
      <PageHero
        eyebrow={t("pricing.eyebrow")}
        title={country ? t("pricing.countryTitle", { where: t(`pricing.where.${country}`) }) : t("pricing.pageTitle")}
        sub={
          <PerMarket items={markets} as="span">
            {(m) => t("pricing.pageSub", { currency: m.currency, country: m.name })}
          </PerMarket>
        }
        className="pb-6 text-center sm:pb-8 [&_h1]:mx-auto [&_p]:mx-auto"
      />

      <section aria-labelledby="plans-title" className="bg-transparent px-4 pb-16 sm:px-6 sm:pb-20">
        <h2 id="plans-title" className="sr-only">
          {t("pricing.compareTitle")}
        </h2>
        <div className="mx-auto max-w-[1200px]">
          <PerMarket items={all.map((p) => ({ code: p.market.code, p }))}>
            {({ p }) =>
              hasPurchasablePlan(p) ? (
                <>
                  <PricingTable pricing={p} />
                  {p.market.code === "IN" ? <p className="mx-auto mt-6 max-w-[760px] rounded-[14px] border border-[#C6D9FC] bg-white px-4 py-3 text-center text-sm text-[#1A4FB8]">{t("pricing.inNote")}</p> : null}
                </>
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
        <PerMarket items={all.map((p) => ({ code: p.market.code, p }))}>{({ p }) => (hasPurchasablePlan(p) ? <ComparisonTable pricing={p} /> : null)}</PerMarket>
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

      {others.length ? (
        <Section labelledBy="pricing-countries-title" inner="max-w-[980px]">
          <nav aria-labelledby="pricing-countries-title" className="text-center">
            <h2 id="pricing-countries-title" className="mb-5 text-xl font-bold">
              {t("pricing.otherCountries")}
            </h2>
            <ul className="flex flex-wrap justify-center gap-2.5">
              {others.map((o) => (
                <li key={o.code}>
                  <Link href={o.href} hrefLang={o.info.locale} className="inline-flex min-h-11 items-center rounded-full border border-sand bg-white px-4 text-[15px] font-semibold text-ink no-underline hover:border-royal hover:text-royal">
                    {t("market.short", { country: o.info.name, currency: o.info.currency })}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </Section>
      ) : null}

      <FinalCta calcom={Boolean(env.CALCOM_LINK)} markets={markets} pricingHref={path} />
      <JsonLd
        data={[
          serviceLd(all, { path }),
          faqLd(faq),
          breadcrumbLd(country ? [{ name: markets[0]?.name ?? country, path: HOME_PATHS[country] }, { name: t("nav.pricing"), path }] : [{ name: t("nav.pricing"), path }]),
        ]}
      />
    </>
  );
}
