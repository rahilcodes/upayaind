"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FlaskConical, ShieldCheck, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, fieldA11y } from "@/components/ui/input";
import type { BillingInterval } from "@/generated/prisma/enums";
import { formatMoney } from "@/lib/format";
import { applyCouponAction, simulatePaymentAction, startCheckoutAction } from "./actions";

type Props = {
  planPriceId: string;
  currency: string;
  locale: string;
  amountMinor: number;
  recurring: boolean;
  per: string;
  interval: BillingInterval;
  months: number;
  simulate: boolean;
  initialCoupon: string;
};

export function CheckoutPanel(p: Props) {
  const t = useTranslations("billing.checkout");
  const tt = useTranslations("billing.toasts");
  const router = useRouter();
  const money = (n: number) => formatMoney(n, p.currency, p.locale);

  const [code, setCode] = React.useState(p.initialCoupon);
  const [coupon, setCoupon] = React.useState<{ code: string; discountMinor: number; totalMinor: number } | null>(null);
  const [couponError, setCouponError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [simId, setSimId] = React.useState<string | null>(null);
  const [applying, startApply] = React.useTransition();
  const [paying, startPay] = React.useTransition();
  const [redirecting, setRedirecting] = React.useState(false);

  const apply = (value: string) =>
    startApply(async () => {
      setCouponError(null);
      const r = await applyCouponAction(p.planPriceId, value);
      if (r.ok) {
        setCoupon(r.data);
        toast.success(t("couponApplied", { code: r.data.code }));
      } else {
        setCoupon(null);
        setCouponError(r.error);
      }
    });

  // Apply a coupon passed in the URL (?coupon=) once.
  const applied = React.useRef(false);
  React.useEffect(() => {
    if (p.initialCoupon && !applied.current) {
      applied.current = true;
      apply(p.initialCoupon);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pay = () =>
    startPay(async () => {
      setError(null);
      const r = await startCheckoutAction(p.planPriceId, coupon?.code ?? null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.data.kind === "redirect") {
        setRedirecting(true);
        window.location.assign(r.data.url);
      } else setSimId(r.data.subscriptionId);
    });

  const simulatePay = () =>
    startPay(async () => {
      if (!simId) return;
      setError(null);
      const r = await simulatePaymentAction(simId, coupon?.code ?? null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(tt("simulated"));
      router.push("/app/onboarding?paid=1");
    });

  const total = coupon ? coupon.totalMinor : p.amountMinor;

  return (
    <aside aria-labelledby="summary-heading" className="rounded-[20px] border border-border bg-surface p-5 shadow-[0_20px_50px_-24px_rgba(11,24,70,0.25)] sm:p-7 lg:sticky lg:top-6">
      <h2 id="summary-heading" className="text-[17px] font-bold">
        {t("summary")}
      </h2>

      <form
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) apply(code.trim());
        }}
      >
        {coupon ? (
          <div className="flex min-h-12 items-center justify-between gap-3 rounded-[10px] border border-[#BFE3CF] bg-[#E6F4EC] px-3.5 text-sm font-semibold text-[#155C3A]">
            <span className="inline-flex items-center gap-2">
              <Tag className="h-4 w-4" aria-hidden="true" />
              {t("couponApplied", { code: coupon.code })}
            </span>
            <button
              type="button"
              onClick={() => {
                setCoupon(null);
                setCode("");
              }}
              aria-label={t("couponRemove")}
              className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-[8px] hover:bg-white/50"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <Field id="coupon" label={t("couponLabel")} error={couponError}>
            <div className="flex gap-2">
              <Input
                {...fieldA11y("coupon", couponError)}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={t("couponPlaceholder")}
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={40}
                className="uppercase placeholder:normal-case"
              />
              <Button type="submit" variant="outline" className="h-12 shrink-0" loading={applying} disabled={!code.trim() || simId !== null}>
                {t("couponApply")}
              </Button>
            </div>
          </Field>
        )}
      </form>

      <dl className="mt-6 grid gap-2.5 text-[15px]">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t("subtotal")}</dt>
          <dd className="tabular">{money(p.amountMinor)}</dd>
        </div>
        {coupon ? (
          <div className="flex justify-between gap-3 text-success">
            <dt>{t("discount", { code: coupon.code })}</dt>
            <dd className="tabular">−{money(coupon.discountMinor)}</dd>
          </div>
        ) : null}
        <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-3.5">
          <dt className="font-bold">{t("total")}</dt>
          <dd className="tabular text-[24px] font-bold" aria-live="polite">
            {money(total)}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-[13px] text-muted-foreground">{p.recurring ? t("renews", { every: t(`every.${p.interval}`) }) : t("oneTime", { months: p.months })}</p>

      {error ? (
        <div role="alert" className="mt-5 rounded-[10px] border border-[#F3C8C3] bg-[#FCEAE8] px-4 py-3 text-sm text-[#8E231B]">
          {error}
        </div>
      ) : null}

      {simId ? (
        <div className="mt-5 rounded-[14px] border border-dashed border-[#E4C48A] bg-[#FDF3E1] p-4 text-[#5E3C08]" role="region" aria-labelledby="sim-title">
          <p id="sim-title" className="inline-flex items-center gap-2 text-sm font-bold">
            <FlaskConical className="h-4 w-4" aria-hidden="true" />
            {t("simTitle")}
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed">{t("simBody")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={simulatePay} loading={paying} variant="ink" size="md">
              {t("simButton")}
            </Button>
            <Button onClick={() => setSimId(null)} variant="ghost" size="md" disabled={paying}>
              {t("simCancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={pay} loading={paying || redirecting} size="lg" className="mt-5 w-full">
          {redirecting ? t("redirecting") : t("pay")}
        </Button>
      )}

      <p className="mt-4 flex items-start gap-2 text-[13px] text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
        {t("secureNote")}
      </p>
      <p className="mt-3 text-[13px] text-muted-foreground">
        {t.rich("legal", {
          terms: (c) => (
            <Link href="/legal/terms" target="_blank" className="font-semibold text-primary underline-offset-2 hover:underline">
              {c}
            </Link>
          ),
          refund: (c) => (
            <Link href="/legal/refund" target="_blank" className="font-semibold text-primary underline-offset-2 hover:underline">
              {c}
            </Link>
          ),
        })}
      </p>
      <p className="mt-2 text-[13px] text-muted-foreground">
        {t.rich("help", {
          contact: (c) => (
            <Link href="/contact" className="font-semibold text-primary underline-offset-2 hover:underline">
              {c}
            </Link>
          ),
        })}
      </p>
    </aside>
  );
}
