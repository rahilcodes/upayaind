import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Check, Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { requireStudent } from "@/server/auth/guards";
import { INTERVAL_MONTHS } from "@/server/services/catalog";
import { BillingError, getCheckoutQuote, liveRecurringSubscription, simulationEnabled, type CheckoutQuote } from "@/server/services/billing";
import { formatMoney } from "@/lib/format";
import { CheckoutPanel } from "./checkout-panel";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };
export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="portal flex min-h-dvh flex-col bg-canvas text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="UpayaInd home" className="rounded-md">
            <Logo size={30} />
          </Link>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <Lock className="h-4 w-4" aria-hidden="true" />
            <CheckoutEyebrow />
          </span>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:py-12">
        {children}
      </main>
    </div>
  );
}

async function CheckoutEyebrow() {
  const t = await getTranslations("billing.checkout");
  return <>{t("eyebrow")}</>;
}

async function Notice({ title, body, href, cta }: { title: string; body: React.ReactNode; href: string; cta: string }) {
  return (
    <Shell>
      <div className="mx-auto max-w-lg rounded-[20px] border border-border bg-surface p-6 text-center shadow-[0_20px_50px_-24px_rgba(11,24,70,0.25)] sm:p-10">
        <h1 className="text-[24px] font-bold tracking-[-0.01em]">{title}</h1>
        <p role="status" className="mt-2 text-[15px] text-muted-foreground">
          {body}
        </p>
        <Link href={href} className={buttonVariants({ className: "mt-6" })}>
          {cta}
        </Link>
      </div>
    </Shell>
  );
}

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { user, student } = await requireStudent();
  const t = await getTranslations("billing.checkout");
  const tc = await getTranslations();

  if (!sp.plan) return <Notice title={t("missingPlan")} body={t("missingPlanBody")} href="/pricing" cta={t("seePricing")} />;

  if (await liveRecurringSubscription(student.id)) {
    return <Notice title={t("alreadyActiveTitle")} body={t("alreadyActiveBody")} href="/app/billing" cta={t("goToBilling")} />;
  }

  let quote: CheckoutQuote;
  try {
    quote = await getCheckoutQuote({ userId: user.id, studentId: student.id }, sp.plan);
  } catch (e) {
    if (e instanceof BillingError) return <Notice title={t("unavailableTitle")} body={e.message} href="/pricing" cta={t("seePricing")} />;
    throw e;
  }

  const money = (n: number) => formatMoney(n, quote.currency, quote.locale);
  const per = tc(`intervalPer.${quote.interval}`);

  return (
    <Shell>
      <Link href="/pricing" className="mb-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("changePlan")}
      </Link>
      <h1 className="text-[26px] font-bold leading-tight tracking-[-0.01em] sm:text-[30px]">{t("title")}</h1>
      <p className="mt-1.5 max-w-2xl text-[15px] text-muted-foreground">{t("subtitle")}</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_400px] lg:items-start">
        <section aria-labelledby="plan-heading" className="rounded-[20px] border border-border bg-surface p-5 sm:p-7">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("plan")}</p>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="plan-heading" className="text-[22px] font-bold">
              {quote.planName}
            </h2>
            <p className="tabular text-[22px] font-bold">
              {money(quote.amountMinor)} <span className="text-base font-medium text-muted-foreground">{per}</span>
            </p>
          </div>
          {quote.planDescription ? <p className="mt-2 text-[15px] text-muted-foreground">{quote.planDescription}</p> : null}
          <div className="mt-5 rounded-[14px] bg-accent px-4 py-3 text-[15px] font-semibold text-accent-foreground">
            {t("dailyTarget", { count: quote.dailyTarget })}
            {quote.interviewsPromise ? <span className="mt-0.5 block text-sm font-medium opacity-80">{t("interviews", { value: quote.interviewsPromise })}</span> : null}
          </div>
          {quote.features.length ? (
            <>
              <h3 className="mt-6 text-sm font-semibold">{t("whatsIncluded")}</h3>
              <ul className="mt-3 grid gap-2.5">
                {quote.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[15px]">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E6F4EC] text-success">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-5 text-sm">
            <div>
              <dt className="text-muted-foreground">{t("billing")}</dt>
              <dd className="mt-0.5 font-semibold">{tc(`interval.${quote.interval}`)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("country")}</dt>
              <dd className="mt-0.5 font-semibold">{quote.marketName}</dd>
            </div>
          </dl>
        </section>

        <CheckoutPanel
          planPriceId={quote.planPriceId}
          currency={quote.currency}
          locale={quote.locale}
          amountMinor={quote.amountMinor}
          recurring={quote.recurring}
          per={per}
          interval={quote.interval}
          months={INTERVAL_MONTHS[quote.interval]}
          simulate={simulationEnabled()}
          initialCoupon={sp.coupon ?? ""}
        />
      </div>
    </Shell>
  );
}
