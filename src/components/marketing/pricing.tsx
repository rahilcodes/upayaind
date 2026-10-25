import { getTranslations } from "next-intl/server";
import type { BillingInterval } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import type { PricingPlan } from "@/server/services/catalog";
import { formatPrice, type MarketPricing } from "./data";
import { IntervalTabs } from "./interval-tabs";
import { trackAttrs } from "./track";
import { Check } from "./ui";

type Price = PricingPlan["prices"][number];

/** One plan card from the approved design (featured = navy with gradient badge). */
export async function PlanCard({ plan, price, market, compact = false }: { plan: PricingPlan; price: Price; market: MarketPricing["market"]; compact?: boolean }) {
  const t = await getTranslations("marketing.pricing");
  const featured = plan.isFeatured;
  const interval = price.interval as BillingInterval;
  const features = compact ? plan.features.slice(0, 4) : plan.features;
  const btn = cn(
    "mt-auto inline-flex min-h-[50px] items-center justify-center rounded-[12px] px-5 text-base font-semibold no-underline transition-colors",
    featured ? "bg-white text-ink hover:bg-[#E8EDFB] hover:text-ink" : "bg-[#EAF1FE] text-royal hover:bg-royal hover:text-white",
  );
  return (
    <div
      className={cn(
        "relative flex h-full flex-col gap-5 rounded-[22px] p-7 sm:p-8",
        featured ? "border-2 border-[#1747B8] brand-deep text-white shadow-[0_30px_60px_-30px_rgba(11,24,70,0.6)]" : "border border-[#E3E6EF] bg-white text-ink",
      )}
    >
      {featured ? (
        <span className="brand-gradient absolute -top-[13px] left-7 rounded-full px-3 py-[5px] text-xs font-bold uppercase tracking-[0.04em] text-white sm:left-8">
          {t("mostPopular")}
        </span>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-xl font-bold">{plan.name}</h3>
        {price.savingPct > 0 ? (
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", featured ? "bg-[#1E7B4F] text-white" : "bg-[#E6F4EC] text-[#1E7B4F]")}>
            {t("save", { pct: price.savingPct })}
          </span>
        ) : null}
      </div>
      {plan.description && !compact ? <p className={cn("-mt-3 text-[15px]", featured ? "text-[#EEF4FF]" : "text-[#3E4A6E]")}>{plan.description}</p> : null}
      <div>
        {price.purchasable ? (
          <>
            <p className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="font-display text-[44px] font-semibold leading-none tabular">{formatPrice(price.amountMinor, price.currency, market.locale)}</span>
              <span className="opacity-75">{t(`per.${interval}`)}</span>
            </p>
            {/* India's 90-day packages are sold as one price: no "a month" breakdown (client request, D-153). */}
            {interval !== "MONTHLY" && interval !== "ONE_TIME" && interval !== "QUARTERLY" ? (
              <p className={cn("mt-2 text-sm", featured ? "text-[#EEF4FF]" : "text-[#5A6585]")}>
                {t("perMonth", { amount: formatPrice(price.perMonthMinor, price.currency, market.locale) })}
              </p>
            ) : null}
          </>
        ) : (
          <p className="font-display text-[28px] font-semibold leading-tight">{t("placeholder")}</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="font-semibold">{t("target", { n: price.dailyTarget })}</p>
        {price.interviewsPromise ? (
          <p className={cn("flex items-start gap-2 text-[15px] font-semibold", featured ? "text-[#EEF4FF]" : "text-royal")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-1 shrink-0">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M16 3v4M8 3v4M3 11h18M9 16l2 2 4-4" />
            </svg>
            <span>{t("interviews", { promise: price.interviewsPromise })}</span>
          </p>
        ) : null}
      </div>
      <ul className="flex flex-1 flex-col gap-2.5 text-[15px]">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <Check className="mt-1" color={featured ? "#FFFFFF" : "#1E7B4F"} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {price.purchasable ? (
        <a
          href={`/signup?plan=${encodeURIComponent(price.id)}`}
          data-plan-id={price.id}
          aria-label={t("chooseAria", { plan: plan.name, interval: t(`interval.${interval}`) })}
          {...trackAttrs("plan_selected", { plan: plan.code, interval, market: market.code })}
          className={btn}
        >
          {t("choose", { plan: plan.name })}
        </a>
      ) : (
        <button type="button" disabled className={cn(btn, "cursor-not-allowed opacity-60")}>
          {t("unavailable")}
        </button>
      )}
    </div>
  );
}

export function planGrid(n: number) {
  return cn("grid gap-6 pt-3", n >= 3 ? "md:grid-cols-2 lg:grid-cols-3" : n === 2 ? "md:grid-cols-2 max-w-[820px] mx-auto" : "max-w-[420px] mx-auto");
}

/** Cards for one interval (plans without that interval are skipped). */
export async function PlanCards({ pricing, interval, compact }: { pricing: MarketPricing; interval: BillingInterval; compact?: boolean }) {
  const rows = pricing.plans.flatMap((p) => {
    const price = p.prices.find((x) => x.interval === interval);
    return price ? [{ p, price }] : [];
  });
  return (
    <div className={planGrid(rows.length)}>
      {rows.map(({ p, price }) => (
        <PlanCard key={p.planId} plan={p} price={price} market={pricing.market} compact={compact} />
      ))}
    </div>
  );
}

/** Pricing page plan switcher: only intervals that exist for the market; saving % in the tab. */
export async function PricingTable({ pricing }: { pricing: MarketPricing }) {
  const t = await getTranslations("marketing.pricing");
  const tabs = pricing.intervals.map((iv) => {
    const best = Math.max(0, ...pricing.plans.flatMap((p) => p.prices.filter((x) => x.interval === iv && x.purchasable).map((x) => x.savingPct)));
    return { key: iv, label: t(`interval.${iv}`), badge: best > 0 ? t("save", { pct: best }) : undefined };
  });
  const panels: Record<string, React.ReactNode> = {};
  for (const iv of pricing.intervals) panels[iv] = <PlanCards pricing={pricing} interval={iv} />;
  return <IntervalTabs idBase={`price-${pricing.market.code.toLowerCase()}`} label={t("intervalLabel")} tabs={tabs} panels={panels} />;
}

/** Feature comparison across plans (rows = union of features, in plan order). */
export async function ComparisonTable({ pricing }: { pricing: MarketPricing }) {
  const t = await getTranslations("marketing.pricing");
  const plans = pricing.plans;
  if (plans.length < 2) return null;
  const features: string[] = [];
  // The daily target has its own row; skip "N … applications every weekday" / "N–M … applications/day" features that restate it.
  const restatesTarget = (f: string) => /^\d+\b.*applications?\s*(every (week)?day|\/\s*day|per day|a day)/i.test(f);
  // "Everything in Basic" inherits that plan's features (and the line itself is not a row).
  const inheritsFrom = (f: string) => /^everything in (.+?)(,|$)/i.exec(f)?.[1]?.trim() ?? null;
  const effective = new Map<string, Set<string>>();
  const resolve = (p: PricingPlan, seen: string[] = []): Set<string> => {
    const cached = effective.get(p.planId);
    if (cached) return cached;
    const out = new Set<string>();
    for (const f of p.features) {
      const parent = inheritsFrom(f);
      if (parent) {
        const base = plans.find((q) => q.name.toLowerCase() === parent.toLowerCase() && !seen.includes(q.planId));
        if (base) for (const g of resolve(base, [...seen, p.planId])) out.add(g);
      } else out.add(f);
    }
    effective.set(p.planId, out);
    return out;
  };
  for (const p of plans) for (const f of resolve(p)) if (!features.includes(f) && !restatesTarget(f)) features.push(f);
  const has = (p: PricingPlan, f: string) => resolve(p).has(f);
  const monthly = (p: PricingPlan) => p.prices.find((x) => x.interval === "MONTHLY") ?? p.prices[0];
  return (
    <div tabIndex={0} role="region" aria-label="Plan comparison" className="relative w-full max-w-full overflow-x-auto rounded-[20px] border border-sand bg-white">
      <table className="w-full min-w-[640px] border-collapse text-left text-[15px]">
        <caption className="sr-only">{t("compareCaption", { country: pricing.market.name })}</caption>
        <thead>
          <tr className="border-b border-sand">
            <th scope="col" className="px-5 py-4 font-semibold text-[#5A6585]">
              {t("feature")}
            </th>
            {plans.map((p) => (
              <th key={p.planId} scope="col" className={cn("px-5 py-4 text-base font-bold", p.isFeatured && "bg-[#F1F4FB]")}>
                {p.name}
                {p.isFeatured ? <span className="ml-2 align-middle text-[11px] font-bold uppercase tracking-[0.04em] text-royal">{t("mostPopular")}</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[#EEECE4]">
            <th scope="row" className="px-5 py-3.5 font-medium">
              {t("rowPrice")}
            </th>
            {plans.map((p) => {
              const m = monthly(p);
              return (
                <td key={p.planId} className={cn("px-5 py-3.5 tabular", p.isFeatured && "bg-[#F1F4FB]")}>
                  {m?.purchasable ? `${formatPrice(m.amountMinor, m.currency, pricing.market.locale)} ${t(`per.${m.interval}`)}` : t("placeholder")}
                </td>
              );
            })}
          </tr>
          <tr className="border-b border-[#EEECE4]">
            <th scope="row" className="px-5 py-3.5 font-medium">
              {t("rowTarget")}
            </th>
            {plans.map((p) => (
              <td key={p.planId} className={cn("px-5 py-3.5 font-semibold tabular", p.isFeatured && "bg-[#F1F4FB]")}>
                {monthly(p)?.dailyTarget ?? "—"}
              </td>
            ))}
          </tr>
          {plans.some((p) => p.prices.some((x) => x.interviewsPromise)) ? (
            <tr className="border-b border-[#EEECE4]">
              <th scope="row" className="px-5 py-3.5 font-medium">
                {t("rowInterviews")}
              </th>
              {plans.map((p) => (
                <td key={p.planId} className={cn("px-5 py-3.5", p.isFeatured && "bg-[#F1F4FB]")}>
                  {monthly(p)?.interviewsPromise ?? "—"}
                </td>
              ))}
            </tr>
          ) : null}
          {features.map((f, i) => (
            <tr key={f} className={cn(i < features.length - 1 && "border-b border-[#EEECE4]")}>
              <th scope="row" className="px-5 py-3.5 font-medium">
                {f}
              </th>
              {plans.map((p) => (
                <td key={p.planId} className={cn("px-5 py-3.5", p.isFeatured && "bg-[#F1F4FB]")}>
                  {has(p, f) ? (
                    <span className="inline-flex items-center gap-2">
                      <Check />
                      <span className="sr-only">{t("included")}</span>
                    </span>
                  ) : (
                    <span className="text-[#8A93AD]">
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">{t("notIncluded")}</span>
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
