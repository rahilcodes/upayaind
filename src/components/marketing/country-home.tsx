import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { env } from "@/env";
import type { HomeMarket } from "@/lib/market";
import { cn } from "@/lib/utils";
import { DashboardDemo, type DemoApp } from "./dashboard-demo";
import { HeroDashboardMock, PILL } from "./dashboard-mock";
import { formatCount, getLandings, getMarketPricing, getMarketPricingFallback, getPublicStats, getStories, hasPurchasablePlan, hiredAt, targetRange, type MarketPricing } from "./data";
import { JsonLd, faqLd } from "./json-ld";
import { MarketPin } from "./market";
import { PlanCards } from "./pricing";
import { Audiences, FaqList, FinalCta, PrepSection, StoryCard } from "./sections";
import { trackAttrs } from "./track";
import { ArrowRight, Check, Eyebrow, H2, Section, TextLink, cta, h1Class } from "./ui";
import { getPublished } from "@/server/services/cms";

/**
 * Country homepage (D-141). One structure for `/` (US), `/in` and `/uk`;
 * every string comes from `marketing.country.<CODE>` so each country gets its
 * own tone and offer. Static (ISR): no cookies()/headers(); the middleware
 * rewrites `/` to the visitor's country page.
 *
 * Tones alternate paper / white, with the proof strip (ink) and the demo
 * (tint) as accents. Mobile-first: every grid stacks at 375px.
 */
export async function CountryHome({ market }: { market: HomeMarket }) {
  const [t, tc, ts, pricing] = await Promise.all([getTranslations("marketing"), getTranslations(`marketing.country.${market}`), getTranslations("status"), getMarketPricing(market)]);
  const [stats, stories, landings, guarantee] = await Promise.all([getPublicStats(), getStories(), getLandings(), getPublished("LEGAL", "guarantee")]);
  const p: MarketPricing = pricing ?? getMarketPricingFallback(market);
  const range = targetRange(p);
  const fill = (s: string) => s.replace("{min}", String(range.min)).replace("{max}", String(range.max));
  const companies = hiredAt(stories);
  const counters = [
    { n: stats.students, label: t("proof.students") },
    { n: stats.applications, label: t("proof.applications") },
    { n: stats.interviews, label: t("proof.interviews") },
  ].filter((c) => c.n > 0);
  const who = tc.raw("who.items") as { title: string; body: string }[];
  const eligibility = tc.raw("eligibility.items") as { title: string; body: string }[];
  const compareRows = tc.raw("compare.rows") as { label: string; diy: string; us: string }[];
  const steps = tc.raw("steps.items") as { when: string; title: string; body: string }[];
  const portals = tc.raw("portals.items") as string[];
  const formatPoints = tc.raw("portals.formatPoints") as string[];
  const faq = tc.raw("faq.items") as { q: string; a: string }[];
  const demoApps = t.raw("demo.apps") as DemoApp[];
  const demoCopy = Object.fromEntries(
    ["regionLabel", "student", "planLine", "badge", "tabsLabel", "tabAll", "tabActive", "tabInterviews", "tabClosed", "search", "searchLabel", "colResume", "resumeShort", "empty", "count", "statToday", "statWeek", "statResponse", "statInterviews", "detailTitle", "detailKeywords", "detailAts", "sample"].map((k) => [k, t(`demo.${k}`, { count: "{count}" })]),
  );
  const statusLabels = Object.fromEntries(Object.keys(PILL).map((s) => [s, ts(s as "APPLIED")]));
  const kw = (c: React.ReactNode) => <mark className="rounded-[3px] bg-[#D6E5FD] px-[3px] text-ink">{c}</mark>;
  const purchasable = hasPurchasablePlan(p);
  const bookHref = env.CALCOM_LINK ? "/contact#book" : "/contact";
  const loc = `home_${market.toLowerCase()}`;
  // Tone alternation continues past the optional CMS sections (stories, audiences).
  const flip = (tone: "paper" | "white") => (tone === "paper" ? "white" : "paper");
  const audiencesTone = stories.length ? "white" : "paper";
  const pricingTone = landings.length ? flip(audiencesTone) : audiencesTone;
  const prepTone = flip(pricingTone);
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

  return (
    <>
      <MarketPin code={market} />

      {/* 1. Hero */}
      <section className="relative overflow-hidden px-4 pb-20 pt-12 sm:px-6 sm:pb-[88px] sm:pt-[72px]">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-14 lg:flex-row lg:items-center">
          <div className="min-w-0 lg:flex-[1_1_440px]">
            <p className="mb-6 inline-flex items-center gap-2 rounded-full bg-[#EAF1FE] px-3 py-1.5 text-[13px] font-semibold text-royal">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 17l6-6 4 4 8-8" />
                <path d="M14 7h7v7" />
              </svg>
              {tc("hero.eyebrow")}
            </p>
            <h1 className={cn(h1Class, "mb-6 sm:text-[60px] lg:text-[68px] lg:leading-[1.04]")}>
              {tc("hero.titleLead")} <span className="text-gradient">{tc("hero.titleAccent")}</span>
            </h1>
            <p className="mb-9 max-w-[520px] text-lg text-[#3E4A6E] sm:text-[19px]">{tc("hero.sub", { min: range.min, max: range.max })}</p>
            <div className="mb-7 flex flex-wrap gap-3">
              <Link href="/pricing" className={cta.primary} {...trackAttrs("cta_get_started", { location: "hero", market })}>
                {tc("hero.ctaPrimary")}
                <ArrowRight />
              </Link>
              <Link href="/how-it-works" className={cta.outline}>
                {tc("hero.ctaSecondary")}
              </Link>
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#3E4A6E]">
              {[tc("hero.point1"), tc("hero.point2"), tc("hero.point3")].map((pt) => (
                <li key={pt} className="flex items-center gap-1.5">
                  <Check />
                  {pt}
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

      {/* 3. Who it's for (country-specific) */}
      <Section labelledBy="who-title">
        <Eyebrow>{tc("who.eyebrow")}</Eyebrow>
        <H2 id="who-title" className="mb-4 max-w-[760px]">
          {tc("who.title")}
        </H2>
        <p className="mb-12 max-w-[640px] text-lg text-[#3E4A6E]">{tc("who.sub")}</p>
        <ul className="grid gap-5 md:grid-cols-3">
          {who.map((w, i) => (
            <li key={w.title} className="flex flex-col rounded-[18px] border border-sand bg-white p-7">
              <span aria-hidden="true" className="mb-5 flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#EAF1FE] font-display text-lg font-semibold text-royal">
                {i + 1}
              </span>
              <h3 className="mb-2 text-[19px] font-bold">{w.title}</h3>
              <p className="text-[#3E4A6E]">{w.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* 4. Eligibility / work authorisation (country-specific) */}
      <Section tone="white" labelledBy="eligibility-title">
        <Eyebrow>{tc("eligibility.eyebrow")}</Eyebrow>
        <H2 id="eligibility-title" className="mb-4 max-w-[760px]">
          {tc("eligibility.title")}
        </H2>
        <p className="mb-12 max-w-[640px] text-lg text-[#3E4A6E]">{tc("eligibility.sub")}</p>
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {eligibility.map((e) => (
            <div key={e.title} className="rounded-[16px] border border-sand bg-paper p-[22px]">
              <dt className="mb-1.5 flex items-start gap-2 font-bold">
                <Check className="mt-1" />
                <span>{e.title}</span>
              </dt>
              <dd className="text-[15px] text-[#3E4A6E]">{e.body}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-[13px] text-[#5A6585]">
          {tc("eligibility.note")} {t("country.shared.eligibilityDisclaimer")}
        </p>
      </Section>

      {/* 5. Problem → solution */}
      <Section labelledBy="why-title">
        <Eyebrow>{tc("compare.eyebrow")}</Eyebrow>
        <H2 id="why-title" className="mb-12 max-w-[720px]">
          {tc("compare.title")}
        </H2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-[20px] border border-sand bg-white p-7 sm:p-8">
            <h3 className="mb-6 text-lg font-bold text-[#5A6585]">{tc("compare.diy")}</h3>
            <dl className="flex flex-col gap-[18px]">
              {compareRows.map((r, i) => (
                <div key={r.label} className={cn("flex justify-between gap-4", i < compareRows.length - 1 && "border-b border-[#EEECE4] pb-[18px]")}>
                  <dt>{r.label}</dt>
                  <dd className="text-right font-bold">{r.diy}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="relative overflow-hidden rounded-[20px] brand-deep p-7 text-white sm:p-8">
            <div aria-hidden="true" className="brand-gradient absolute inset-x-0 top-0 h-1" />
            <h3 className="mb-6 text-lg font-bold text-[#FFFFFF]">{tc("compare.us")}</h3>
            <dl className="flex flex-col gap-[18px]">
              {compareRows.map((r, i) => (
                <div key={r.label} className={cn("flex justify-between gap-4", i < compareRows.length - 1 && "border-b border-[rgba(255,255,255,0.22)] pb-[18px]")}>
                  <dt>{r.label}</dt>
                  <dd className="text-right font-bold tabular">{r.us.replace("{min}", formatCount(range.min * 20)).replace("{max}", formatCount(range.max * 20))}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Section>

      {/* 6. How it works */}
      <Section id="how" tone="white" labelledBy="how-title">
        <Eyebrow>{tc("steps.eyebrow")}</Eyebrow>
        <H2 id="how-title" className="mb-14">
          {tc("steps.title")}
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
              <p className="text-[#3E4A6E]">{fill(s.body)}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* 7. Dashboard demo */}
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

      {/* 8. Portals + document format (country-specific) */}
      <Section labelledBy="portals-title" inner="flex flex-col gap-12 lg:flex-row lg:items-start">
        <div className="min-w-0 lg:flex-[1_1_440px]">
          <Eyebrow>{tc("portals.eyebrow")}</Eyebrow>
          <H2 id="portals-title" className="mb-4">
            {tc("portals.title")}
          </H2>
          <p className="mb-7 text-lg text-[#3E4A6E]">{tc("portals.sub")}</p>
          <ul aria-label={t("country.shared.portalsLabel")} className="flex flex-wrap gap-2.5">
            {portals.map((name) => (
              <li key={name} className="rounded-full border border-sand bg-white px-4 py-2 text-[15px] font-semibold">
                {name}
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0 rounded-[20px] border border-sand bg-white p-7 sm:p-8 lg:flex-[1_1_480px]">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.06em] text-[#5A6585]">{t("country.shared.formatLabel", { doc: p.market.docWord })}</p>
          <h3 className="mb-5 text-xl font-bold">{tc("portals.formatTitle")}</h3>
          <ul className="flex flex-col gap-3">
            {formatPoints.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-[15px]">
                <Check className="mt-1" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* 9. Tailored resume showcase (shared) */}
      <Section tone="white" labelledBy="tailor-title">
        <Eyebrow>{t("showcase.eyebrow")}</Eyebrow>
        <H2 id="tailor-title" className="mb-4 max-w-[760px]">
          {t("showcase.title")}
        </H2>
        <p className="mb-12 max-w-[640px] text-lg text-[#3E4A6E]">{t("showcase.sub")}</p>
        <div className="grid gap-6 md:grid-cols-2">
          {(["a", "b"] as const).map((k) => (
            <article key={k} className="rounded-[20px] border border-sand bg-paper p-7">
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

      {/* 10. Success stories (CMS, shared) — hidden until real stories are published */}
      {stories.length ? (
        <Section id="stories" labelledBy="stories-title">
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

      {/* 11. Audience landing pages (CMS, shared) */}
      <Audiences items={landings} tone={audiencesTone} />

      {/* 12. Pricing preview — this market only */}
      <Section id="pricing" tone={pricingTone} labelledBy="pricing-title">
        <div className="mb-12 text-center">
          <Eyebrow className="text-center">{t("pricing.eyebrow")}</Eyebrow>
          <H2 id="pricing-title" className="mb-3">
            {purchasable ? tc("pricing.title") : tc("pricing.finalisingTitle")}
          </H2>
          <p className="mx-auto max-w-[620px] text-lg text-[#3E4A6E]">{purchasable ? tc("pricing.sub") : tc("pricing.finalisingBody")}</p>
        </div>
        {purchasable ? (
          <>
            <PlanCards pricing={p} interval={p.intervals.includes("MONTHLY") ? "MONTHLY" : p.intervals[0]!} compact />
            <p className="mt-7 text-center">
              <TextLink href="/pricing" className="inline-flex min-h-11 items-center">
                {guarantee ? t("pricing.compareLink") : t("pricing.compareLinkNoGuarantee")}
              </TextLink>
            </p>
          </>
        ) : (
          <div className="mx-auto max-w-[820px] rounded-[22px] border border-sand bg-white p-7 sm:p-8">
            {p.plans.length ? (
              <ul className="mb-7 grid gap-3 sm:grid-cols-3">
                {p.plans.map((plan) => {
                  const price = plan.prices.find((x) => x.interval === "MONTHLY") ?? plan.prices[0];
                  return (
                    <li key={plan.planId} className="rounded-[14px] bg-paper px-4 py-3.5 text-center">
                      <span className="block font-bold">{plan.name}</span>
                      {price ? <span className="block text-sm text-[#3E4A6E]">{t("pricing.target", { n: price.dailyTarget })}</span> : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/contact" className={cta.primary} {...trackAttrs("cta_book_call", { location: `pricing_${loc}`, kind: "contact" })}>
                {t("country.shared.talk")}
                <ArrowRight />
              </Link>
              <Link href={bookHref} className={cta.outline} {...trackAttrs("cta_book_call", { location: `pricing_${loc}` })}>
                {t("country.shared.book")}
              </Link>
            </div>
            <p className="mt-6 text-center">
              <TextLink href="/pricing" className="inline-flex min-h-11 items-center">
                {t("country.shared.pricingLink")}
              </TextLink>
            </p>
          </div>
        )}
      </Section>

      {/* 13. Interview prep (shared) */}
      <PrepSection tone={prepTone} />

      {/* 14. FAQ (country-specific) */}
      <Section tone={flip(prepTone)} labelledBy="faq-title" inner="max-w-[820px]">
        <H2 id="faq-title" className="mb-8 text-center">
          {tc("faq.title")}
        </H2>
        <FaqList items={faq.map((f) => ({ q: f.q, html: `<p>${escape(f.a)}</p>` }))} />
        <p className="mt-8 text-center">
          <TextLink href="/faq" className="inline-flex min-h-11 items-center">
            {t("country.shared.faqSeeAll")}
          </TextLink>
        </p>
        <JsonLd data={faqLd(faq.map((f) => ({ q: f.q, a: f.a })))} />
      </Section>

      {/* 15. Final CTA band (shared layout, country copy) */}
      <FinalCta calcom={Boolean(env.CALCOM_LINK)} title={tc("cta.title")} sub={tc("cta.sub")} />
    </>
  );
}
