import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { env } from "@/env";
import { cn } from "@/lib/utils";
import { DashboardDemo, type DemoApp } from "@/components/marketing/dashboard-demo";
import { HeroDashboardMock, PILL } from "@/components/marketing/dashboard-mock";
import { formatCount, getActiveMarkets, getAllPricing, getFaqs, getLandings, getPublicStats, getStories, hiredAt, htmlToText, targetRange } from "@/components/marketing/data";
import { JsonLd, faqLd } from "@/components/marketing/json-ld";
import { PerMarket } from "@/components/marketing/market";
import { PlanCards } from "@/components/marketing/pricing";
import { Audiences, FaqList, FinalCta, PrepSection, StoryCard, faqItems } from "@/components/marketing/sections";
import { trackAttrs } from "@/components/marketing/track";
import { ArrowRight, Check, Eyebrow, H2, Section, TextLink, cta, h1Class } from "@/components/marketing/ui";
import { getPublished } from "@/server/services/cms";
import { pageMetadata } from "@/components/marketing/seo";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.meta");
  return pageMetadata({ title: t("homeTitle"), description: t("homeDescription"), path: "/", absoluteTitle: true });
}

export default async function HomePage() {
  const [t, ts, markets] = await Promise.all([getTranslations("marketing"), getTranslations("status"), getActiveMarkets()]);
  const [pricing, stats, stories, landings, faqs, guarantee] = await Promise.all([
    getAllPricing(markets),
    getPublicStats(),
    getStories(),
    getLandings(),
    getFaqs(8),
    getPublished("LEGAL", "guarantee"),
  ]);
  const range = targetRange(pricing[0]);
  const companies = hiredAt(stories);
  const counters = [
    { n: stats.students, label: t("proof.students") },
    { n: stats.applications, label: t("proof.applications") },
    { n: stats.interviews, label: t("proof.interviews") },
  ].filter((c) => c.n > 0);
  const steps = t.raw("steps.items") as { when: string; title: string; body: string }[];
  const demoApps = t.raw("demo.apps") as DemoApp[];
  const demoCopy = Object.fromEntries(
    ["regionLabel", "student", "planLine", "badge", "tabsLabel", "tabAll", "tabActive", "tabInterviews", "tabClosed", "search", "searchLabel", "colResume", "resumeShort", "empty", "count", "statToday", "statWeek", "statResponse", "statInterviews", "detailTitle", "detailKeywords", "detailAts", "sample"].map((k) => [k, t(`demo.${k}`, { count: "{count}" })]),
  );
  const statusLabels = Object.fromEntries(Object.keys(PILL).map((s) => [s, ts(s as "APPLIED")]));
  const faqList = faqItems(faqs);
  const kw = (c: React.ReactNode) => <mark className="rounded-[3px] bg-[#D6E5FD] px-[3px] text-ink">{c}</mark>;

  return (
    <>
      {/* 1. Hero */}
      <section className="relative overflow-hidden px-4 pb-20 pt-12 sm:px-6 sm:pb-[88px] sm:pt-[72px]">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-14 lg:flex-row lg:items-center">
          <div className="min-w-0 lg:flex-[1_1_440px]">
            <p className="mb-6 inline-flex items-center gap-2 rounded-full bg-[#EAF1FE] px-3 py-1.5 text-[13px] font-semibold text-royal">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 17l6-6 4 4 8-8" />
                <path d="M14 7h7v7" />
              </svg>
              <PerMarket items={markets} as="span">
                {(m) => (markets.length > 1 ? t("hero.eyebrowMarket", { country: m.name }) : t("hero.eyebrow"))}
              </PerMarket>
            </p>
            <h1 className={cn(h1Class, "mb-6 sm:text-[60px] lg:text-[68px] lg:leading-[1.04]")}>
              {t("hero.titleLead")} <span className="text-gradient">{t("hero.titleAccent")}</span>
            </h1>
            <p className="mb-9 max-w-[520px] text-lg text-[#3E4A6E] sm:text-[19px]">
              <PerMarket items={pricing.map((p) => ({ code: p.market.code, ...targetRange(p) }))} as="span">
                {(r) => t("hero.sub", { min: r.min, max: r.max })}
              </PerMarket>
            </p>
            <div className="mb-7 flex flex-wrap gap-3">
              <Link href="/pricing" className={cta.primary} {...trackAttrs("cta_get_started", { location: "hero" })}>
                {t("hero.ctaPrimary")}
                <ArrowRight />
              </Link>
              <Link href="/how-it-works" className={cta.outline}>
                {t("hero.ctaSecondary")}
              </Link>
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#3E4A6E]">
              {[t("hero.point1"), t("hero.point2"), t("hero.point3")].map((p) => (
                <li key={p} className="flex items-center gap-1.5">
                  <Check />
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0 lg:flex-[1_1_480px]">
            <HeroDashboardMock />
          </div>
        </div>
      </section>

      {/* 2. Proof strip — only real, computed numbers */}
      {counters.length || companies.length ? (
        <section aria-label={t("proof.label")} className="brand-deep px-4 py-10 text-white sm:px-6">
          <div className="mx-auto grid max-w-[1200px] items-center gap-7 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
            {counters.length ? (
              <dl className="contents">
                {counters.map((c) => (
                  <div key={c.label} className="flex flex-col-reverse">
                    <dt className="text-sm text-[#E3ECFF]">{c.label}</dt>
                    <dd className="font-display text-[40px] font-semibold leading-tight tabular">{formatCount(c.n)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <p className="text-[13px] text-[#E3ECFF]">
              {counters.length ? t("proof.note") : null}
              {companies.length ? (
                <>
                  {counters.length ? " " : null}
                  {t.rich("proof.hiredAt", {
                    companies: () => <span className="font-semibold text-white">{companies.map((c) => c.name).join(", ")}</span>,
                  })}
                </>
              ) : null}
            </p>
          </div>
        </section>
      ) : null}

      {/* 3. Problem → solution */}
      <Section labelledBy="why-title">
        <Eyebrow>{t("compare.eyebrow")}</Eyebrow>
        <H2 id="why-title" className="mb-12 max-w-[720px]">
          {t("compare.title")}
        </H2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-[20px] border border-sand bg-white p-7 sm:p-8">
            <h3 className="mb-6 text-lg font-bold text-[#5A6585]">{t("compare.diy")}</h3>
            <dl className="flex flex-col gap-[18px]">
              {[
                [t("compare.rowTime"), t("compare.diyTime")],
                [t("compare.rowApps"), t("compare.diyApps")],
                [t("compare.rowResume"), t("compare.diyResume")],
              ].map(([k, v], i) => (
                <div key={k} className={cn("flex justify-between gap-4", i < 2 && "border-b border-[#EEECE4] pb-[18px]")}>
                  <dt>{k}</dt>
                  <dd className="text-right font-bold">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="relative overflow-hidden rounded-[20px] brand-deep p-7 text-white sm:p-8">
            <div aria-hidden="true" className="brand-gradient absolute inset-x-0 top-0 h-1" />
            <h3 className="mb-6 text-lg font-bold text-[#FFFFFF]">{t("compare.us")}</h3>
            <dl className="flex flex-col gap-[18px]">
              {[
                [t("compare.rowTime"), t("compare.usTime")],
                [t("compare.rowApps"), t("compare.usApps", { min: formatCount(range.min * 20), max: formatCount(range.max * 20) })],
                [t("compare.rowResume"), t("compare.usResume")],
              ].map(([k, v], i) => (
                <div key={k} className={cn("flex justify-between gap-4", i < 2 && "border-b border-[rgba(255,255,255,0.22)] pb-[18px]")}>
                  <dt>{k}</dt>
                  <dd className="text-right font-bold tabular">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Section>

      {/* 4. How it works */}
      <Section id="how" tone="white" labelledBy="how-title">
        <Eyebrow>{t("steps.eyebrow")}</Eyebrow>
        <H2 id="how-title" className="mb-14">
          {t("steps.title")}
        </H2>
        <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title}>
              <div className="mb-5 flex items-center gap-3">
                <span aria-hidden="true" className="flex h-12 w-12 flex-none items-center justify-center rounded-[14px] brand-deep font-display text-xl font-semibold text-white">
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

      {/* 5. Dashboard demo */}
      <Section tone="tint" labelledBy="demo-title">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[720px]">
            <Eyebrow>{t("demo.eyebrow")}</Eyebrow>
            <H2 id="demo-title" className="mb-4">
              {t("demo.title")}
            </H2>
            <p className="text-lg text-[#3E4A6E]">{t("demo.sub")}</p>
          </div>
        </div>
        <DashboardDemo apps={demoApps} copy={demoCopy} statusLabels={statusLabels} pills={PILL} />
      </Section>

      {/* 6. Tailored resume showcase */}
      <Section labelledBy="tailor-title">
        <Eyebrow>{t("showcase.eyebrow")}</Eyebrow>
        <H2 id="tailor-title" className="mb-4 max-w-[760px]">
          {t("showcase.title")}
        </H2>
        <p className="mb-12 max-w-[640px] text-lg text-[#3E4A6E]">{t("showcase.sub")}</p>
        <div className="grid gap-6 md:grid-cols-2">
          {(["a", "b"] as const).map((k) => (
            <article key={k} className="rounded-[20px] border border-sand bg-white p-7">
              <div className="mb-[18px] flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-[17px] font-bold">{t("showcase.for", { job: t(`showcase.${k}.job`) })}</h3>
                <span className="rounded-full bg-[#E9F5EE] px-2.5 py-1 text-[13px] font-bold text-[#1E7B4F]">{t("showcase.ats", { score: t(`showcase.${k}.score`) })}</span>
              </div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.06em] text-[#5A6585]">{t("showcase.summary")}</p>
              <p className="mb-4 text-[15px]">{t.rich(`showcase.${k}.summary`, { k: kw })}</p>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.06em] text-[#5A6585]">{t("showcase.skills")}</p>
              <ul className="flex flex-wrap gap-2">
                {(t.raw(`showcase.${k}.skills`) as string[]).map((s) => (
                  <li key={s} className="rounded-[8px] bg-[#F1F3F8] px-2.5 py-1 text-[13px]">
                    {s}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <p className="mt-4 text-[13px] text-[#5A6585]">{t("showcase.note")}</p>
      </Section>

      {/* 7. Success stories (CMS) — hidden until real stories are published */}
      {stories.length ? (
        <Section id="stories" tone="white" labelledBy="stories-title">
          <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
            <H2 id="stories-title">{t("stories.title")}</H2>
            <TextLink href="/success-stories" className="inline-flex min-h-11 items-center">
              {t("stories.all")}
            </TextLink>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {stories.slice(0, 3).map((s) => (
              <StoryCard key={s.id} story={s} />
            ))}
          </div>
        </Section>
      ) : null}

      {/* 8. Who it's for */}
      <Audiences items={landings} />

      {/* 9. Pricing preview (per market) */}
      <Section id="pricing" tone="white" labelledBy="pricing-title">
        <div className="mb-12 text-center">
          <H2 id="pricing-title" className="mb-3">
            {t("pricing.previewTitle")}
          </H2>
          <p className="text-lg text-[#3E4A6E]">
            <PerMarket items={pricing.map((p) => p.market)} as="span">
              {(m) => t("pricing.previewSub", { currency: m.currency, country: m.name })}
            </PerMarket>
          </p>
        </div>
        <PerMarket items={pricing.map((p) => ({ code: p.market.code, p }))}>
          {({ p }) =>
            p.intervals.length ? (
              <PlanCards pricing={p} interval={p.intervals.includes("MONTHLY") ? "MONTHLY" : p.intervals[0]!} compact />
            ) : (
              <p className="mx-auto max-w-[560px] text-center text-[#3E4A6E]">{t("pricing.noPlans", { country: p.market.name })}</p>
            )
          }
        </PerMarket>
        <p className="mt-7 text-center">
          <TextLink href="/pricing" className="inline-flex min-h-11 items-center">
            {guarantee ? t("pricing.compareLink") : t("pricing.compareLinkNoGuarantee")}
          </TextLink>
        </p>
      </Section>

      {/* 10. Interview prep */}
      <PrepSection />

      {/* 11. FAQ (CMS) */}
      {faqList.length ? (
        <Section tone="white" labelledBy="faq-title" inner="max-w-[820px]">
          <H2 id="faq-title" className="mb-8 text-center">
            {t("faq.title")}
          </H2>
          <FaqList items={faqList} />
          <p className="mt-8 text-center">
            <TextLink href="/faq" className="inline-flex min-h-11 items-center">
              {t("faq.seeAll")}
            </TextLink>
          </p>
          <JsonLd data={faqLd(faqs.map((f) => ({ q: f.title, a: htmlToText(f.bodyHtml) || f.excerpt || "" })))} />
        </Section>
      ) : null}

      {/* 12. Final CTA band */}
      <FinalCta calcom={Boolean(env.CALCOM_LINK)} />
    </>
  );
}
