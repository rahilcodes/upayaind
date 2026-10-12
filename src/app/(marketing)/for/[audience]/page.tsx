import type { Metadata } from "next";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { env } from "@/env";
import { getActiveMarkets, getAllPricing, getFaqs, htmlToText, targetRange } from "@/components/marketing/data";
import { HeroDashboardMock } from "@/components/marketing/dashboard-mock";
import { JsonLd, breadcrumbLd, faqLd } from "@/components/marketing/json-ld";
import { PerMarket } from "@/components/marketing/market";
import { PlanCards } from "@/components/marketing/pricing";
import { FaqList, FinalCta, PrepSection, faqItems } from "@/components/marketing/sections";
import { pageMetadata } from "@/components/marketing/seo";
import { trackAttrs } from "@/components/marketing/track";
import { ArrowRight, Eyebrow, H2, Prose, Section, TextLink, container, cta, h1Class } from "@/components/marketing/ui";
import { getPublished, listPublished } from "@/server/services/cms";

export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  const rows = await listPublished("LANDING");
  return rows.map((r) => ({ audience: r.slug }));
}

type Props = { params: Promise<{ audience: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { audience } = await params;
  const [t, e] = await Promise.all([getTranslations("marketing.meta"), getPublished("LANDING", audience)]);
  if (!e) return {};
  return pageMetadata({
    title: e.seoTitle || t("landingTitle", { title: e.title }),
    description: e.seoDescription || e.excerpt || t("landingDescription", { title: e.title }),
    path: `/for/${audience}`,
    canonical: e.canonicalUrl,
    noindex: e.noindex,
    ogImageId: e.ogImageKey,
  });
}

export default async function LandingPage({ params }: Props) {
  const { audience } = await params;
  const [t, e, markets, faqs] = await Promise.all([getTranslations("marketing"), getPublished("LANDING", audience), getActiveMarkets(), getFaqs(6)]);
  if (!e) notFound();
  const pricing = await getAllPricing(markets);
  const range = targetRange(pricing[0]);
  const steps = t.raw("steps.items") as { when: string; title: string; body: string }[];
  const bodyText = htmlToText(e.bodyHtml);
  const hasBody = bodyText && bodyText !== (e.excerpt ?? "").trim();

  return (
    <>
      <section className="relative overflow-hidden px-4 pb-20 pt-12 sm:px-6 sm:pt-16">
        <div className={cn(container, "flex flex-col gap-14 lg:flex-row lg:items-center")}>
          <div className="min-w-0 lg:flex-[1_1_440px]">
            <Eyebrow>{t("landing.eyebrow")}</Eyebrow>
            <h1 className={cn(h1Class, "mb-6")}>{e.title}</h1>
            {e.excerpt ? <p className="mb-6 max-w-[560px] text-lg text-[#3E4A6E] sm:text-[19px]">{e.excerpt}</p> : null}
            <p className="mb-9 max-w-[560px] text-[17px] text-[#3E4A6E]">{t("hero.sub", { min: range.min, max: range.max })}</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/pricing" className={cta.primary} {...trackAttrs("cta_get_started", { location: `landing_${audience}` })}>
                {t("hero.ctaPrimary")}
                <ArrowRight />
              </Link>
              <Link href={env.CALCOM_LINK ? "/contact#book" : "/contact"} className={cta.outline} {...trackAttrs("cta_book_call", { location: `landing_${audience}` })}>
                {t("cta.bookCall")}
              </Link>
            </div>
          </div>
          <div className="min-w-0 lg:flex-[1_1_480px]">
            <HeroDashboardMock />
          </div>
        </div>
      </section>

      {hasBody ? (
        <Section tone="white" label={e.title} inner="max-w-[760px]">
          <Prose html={e.bodyHtml} />
        </Section>
      ) : null}

      <Section tone={hasBody ? "paper" : "white"} labelledBy="landing-how">
        <H2 id="landing-how" className="mb-12">
          {t("landing.howTitle")}
        </H2>
        <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title}>
              <div className="mb-5 flex items-center gap-3">
                <span aria-hidden="true" className="flex h-12 w-12 flex-none items-center justify-center rounded-[14px] bg-ink font-display text-xl font-semibold text-white">
                  {i + 1}
                </span>
                <span aria-hidden="true" className="h-0.5 flex-1 bg-gradient-to-r from-blue to-[rgba(24,184,242,0)]" />
              </div>
              <p className="mb-1.5 text-[13px] font-bold uppercase tracking-[0.04em] text-royal">{s.when}</p>
              <h3 className="mb-2 text-xl font-bold">{s.title}</h3>
              <p className="text-[#3E4A6E]">{s.body.replace("{min}", String(range.min)).replace("{max}", String(range.max))}</p>
            </li>
          ))}
        </ol>
      </Section>

      <PrepSection tone={hasBody ? "white" : "paper"} />

      <Section tone={hasBody ? "paper" : "white"} labelledBy="landing-pricing">
        <div className="mb-12 text-center">
          <H2 id="landing-pricing" className="mb-3">
            {t("landing.pricingTitle")}
          </H2>
          <p className="text-lg text-[#3E4A6E]">
            <PerMarket items={markets} as="span">
              {(m) => t("pricing.previewSub", { currency: m.currency, country: m.name })}
            </PerMarket>
          </p>
        </div>
        <PerMarket items={pricing.map((p) => ({ code: p.market.code, p }))}>
          {({ p }) =>
            p.intervals.length ? (
              <PlanCards pricing={p} interval={p.intervals.includes("MONTHLY") ? "MONTHLY" : p.intervals[0]!} compact />
            ) : (
              <p className="text-center text-[#3E4A6E]">{t("pricing.noPlans", { country: p.market.name })}</p>
            )
          }
        </PerMarket>
        <p className="mt-7 text-center">
          <TextLink href="/pricing" className="inline-flex min-h-11 items-center">
            {t("landing.seePricing")}
          </TextLink>
        </p>
      </Section>

      {faqs.length ? (
        <Section tone={hasBody ? "white" : "paper"} labelledBy="landing-faq" inner="max-w-[820px]">
          <H2 id="landing-faq" className="mb-8 text-center">
            {t("landing.faqTitle")}
          </H2>
          <FaqList items={faqItems(faqs)} />
        </Section>
      ) : null}

      <FinalCta calcom={Boolean(env.CALCOM_LINK)} />
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: e.title, path: `/for/${e.slug}` },
          ]),
          ...(faqs.length ? [faqLd(faqs.map((f) => ({ q: f.title, a: htmlToText(f.bodyHtml) || f.excerpt || "" })))] : []),
        ]}
      />
    </>
  );
}
