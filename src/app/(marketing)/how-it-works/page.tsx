import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { env } from "@/env";
import { DashboardDemo, type DemoApp } from "@/components/marketing/dashboard-demo";
import { PILL } from "@/components/marketing/dashboard-mock";
import { getActiveMarkets, getAllPricing, targetRange } from "@/components/marketing/data";
import { JsonLd, faqLd } from "@/components/marketing/json-ld";
import { FaqList, FinalCta, PrepSection } from "@/components/marketing/sections";
import { pageMetadata } from "@/components/marketing/seo";
import { trackAttrs } from "@/components/marketing/track";
import { ArrowRight, Check, Eyebrow, H2, PageHero, Section, cta } from "@/components/marketing/ui";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.meta");
  return pageMetadata({ title: t("howTitle"), description: t("howDescription"), path: "/how-it-works" });
}

export default async function HowItWorksPage() {
  const [t, ts, markets] = await Promise.all([getTranslations("marketing"), getTranslations("status"), getActiveMarkets()]);
  const pricing = await getAllPricing(markets.slice(0, 1));
  const range = targetRange(pricing[0]);
  const fill = (s: string) => s.replace("{min}", String(range.min)).replace("{max}", String(range.max));
  const timeline = t.raw("how.timeline") as { when: string; title: string; body: string; points: string[] }[];
  const needs = t.raw("how.needs") as { title: string; body: string }[];
  const tailor = t.raw("how.tailorSteps") as { title: string; body: string }[];
  const ethics = t.raw("how.ethics") as { q: string; a: string }[];
  const demoApps = t.raw("demo.apps") as DemoApp[];
  const demoCopy = Object.fromEntries(
    ["regionLabel", "student", "planLine", "badge", "tabsLabel", "tabAll", "tabActive", "tabInterviews", "tabClosed", "search", "searchLabel", "colResume", "resumeShort", "empty", "count", "statToday", "statWeek", "statResponse", "statInterviews", "detailTitle", "detailKeywords", "detailAts", "sample"].map((k) => [k, t(`demo.${k}`, { count: "{count}" })]),
  );
  const statusLabels = Object.fromEntries(Object.keys(PILL).map((s) => [s, ts(s as "APPLIED")]));
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

  return (
    <>
      <PageHero eyebrow={t("how.eyebrow")} title={t("how.title")} sub={t("how.sub")}>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/pricing" className={cta.primary} {...trackAttrs("cta_get_started", { location: "how_hero" })}>
            {t("hero.ctaPrimary")}
            <ArrowRight />
          </Link>
          <Link href={env.CALCOM_LINK ? "/contact#book" : "/contact"} className={cta.outline} {...trackAttrs("cta_book_call", { location: "how_hero" })}>
            {t("cta.bookCall")}
          </Link>
        </div>
      </PageHero>

      <Section tone="white" labelledBy="timeline-title">
        <H2 id="timeline-title" className="mb-12 max-w-[760px]">
          {t("how.timelineTitle")}
        </H2>
        <ol className="relative flex flex-col gap-10 before:absolute before:bottom-6 before:left-6 before:top-6 before:w-0.5 before:bg-gradient-to-b before:from-royal before:via-blue before:to-sky sm:gap-12">
          {timeline.map((s, i) => (
            <li key={s.title} className="relative grid gap-4 pl-[72px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10">
              <span aria-hidden="true" className="absolute left-0 top-0 flex h-12 w-12 items-center justify-center rounded-[14px] brand-deep font-display text-xl font-semibold text-white ring-8 ring-white">
                {i + 1}
              </span>
              <div>
                <p className="mb-1.5 text-[13px] font-bold uppercase tracking-[0.04em] text-royal">{s.when}</p>
                <h3 className="mb-2 text-2xl font-bold">{s.title}</h3>
                <p className="text-[17px] text-[#3E4A6E]">{s.body}</p>
              </div>
              <ul className="flex flex-col gap-2.5 self-start rounded-[16px] border border-sand bg-paper p-5">
                {s.points.map((p) => (
                  <li key={p} className="flex items-start gap-2.5">
                    <Check className="mt-1" />
                    <span>{fill(p)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </Section>

      <Section labelledBy="needs-title">
        <H2 id="needs-title" className="mb-3">
          {t("how.needTitle")}
        </H2>
        <p className="mb-10 max-w-[640px] text-lg text-[#3E4A6E]">{t("how.needSub")}</p>
        <ul className="grid gap-5 md:grid-cols-3">
          {needs.map((n, i) => (
            <li key={n.title} className="rounded-[18px] border border-sand bg-white p-7">
              <span aria-hidden="true" className="mb-4 flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#EAF1FE] font-bold text-royal">
                {i + 1}
              </span>
              <h3 className="mb-2 text-lg font-bold">{n.title}</h3>
              <p className="text-[#3E4A6E]">{n.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="tint" labelledBy="daily-title">
        <Eyebrow>{t("demo.eyebrow")}</Eyebrow>
        <H2 id="daily-title" className="mb-3">
          {t("how.dailyTitle")}
        </H2>
        <p className="mb-10 max-w-[680px] text-lg text-[#3E4A6E]">{t("how.dailySub")}</p>
        <DashboardDemo apps={demoApps} copy={demoCopy} statusLabels={statusLabels} pills={PILL} />
      </Section>

      <Section tone="white" labelledBy="tailor-title">
        <Eyebrow>{t("showcase.eyebrow")}</Eyebrow>
        <H2 id="tailor-title" className="mb-3">
          {t("how.tailorTitle")}
        </H2>
        <p className="mb-10 max-w-[680px] text-lg text-[#3E4A6E]">{t("how.tailorSub")}</p>
        <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {tailor.map((s, i) => (
            <li key={s.title} className="rounded-[18px] border border-sand bg-paper p-6">
              <p className="mb-3 font-display text-3xl font-semibold text-royal">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="mb-2 text-lg font-bold">{s.title}</h3>
              <p className="text-[15px] text-[#3E4A6E]">{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-8 flex items-start gap-3 rounded-[16px] brand-deep px-5 py-4 font-semibold text-white">
          <Check className="mt-1" color="#FFFFFF" />
          {t("how.truth")}
        </p>
      </Section>

      <PrepSection />

      <Section tone="white" labelledBy="ethics-title" inner="max-w-[820px]">
        <H2 id="ethics-title" className="mb-8 text-center">
          {t("how.ethicsTitle")}
        </H2>
        <FaqList items={ethics.map((f) => ({ q: f.q, html: `<p>${escape(f.a)}</p>` }))} />
      </Section>

      <FinalCta calcom={Boolean(env.CALCOM_LINK)} />
      <JsonLd data={faqLd(ethics)} />
    </>
  );
}
