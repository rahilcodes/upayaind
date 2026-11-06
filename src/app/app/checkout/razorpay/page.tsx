import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { env } from "@/env";
import { formatMoney } from "@/lib/format";
import { requireStudent } from "@/server/auth/guards";
import { BillingError } from "@/server/services/billing";
import { razorpayCheckoutData } from "@/server/services/billing/razorpay-confirm";
import { RazorpayPay } from "./razorpay-pay";

export const metadata: Metadata = { title: "Pay with Razorpay", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Razorpay Checkout.js step for Indian packages (D-159): opened after `startCheckout` created the order. */
export default async function RazorpayCheckoutPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { student } = await requireStudent();
  const t = await getTranslations("billing.checkout.razorpay");
  const tc = await getTranslations("billing.checkout");
  const orderId = sp.order ?? "";

  let data: Awaited<ReturnType<typeof razorpayCheckoutData>> = null;
  let error: string | null = null;
  if (orderId) {
    try {
      data = await razorpayCheckoutData(student.id, orderId);
    } catch (e) {
      if (!(e instanceof BillingError)) throw e;
      error = e.message;
    }
  }
  if (data?.paid) redirect("/app/onboarding?paid=1");

  return (
    <div className="portal flex min-h-dvh flex-col bg-canvas text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="UpayaInd home" className="rounded-md">
            <Logo height={40} priority />
          </Link>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <Lock className="h-4 w-4" aria-hidden="true" />
            {tc("eyebrow")}
          </span>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-lg flex-1 px-4 py-8 sm:px-6 lg:py-12">
        <Link href="/pricing" className="mb-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {tc("changePlan")}
        </Link>
        <div className="rounded-[20px] border border-border bg-surface p-6 shadow-[0_20px_50px_-24px_rgba(11,24,70,0.25)] sm:p-8">
          {data && !data.paid ? (
            <>
              <h1 className="text-[24px] font-bold tracking-[-0.01em]">{t("title")}</h1>
              <p className="mt-1.5 text-[15px] text-muted-foreground">{t("sub")}</p>
              <dl className="mt-6 grid grid-cols-2 gap-4 rounded-[14px] bg-accent px-4 py-3 text-sm text-accent-foreground">
                <div>
                  <dt className="opacity-80">{tc("plan")}</dt>
                  <dd className="mt-0.5 font-semibold">UpayaInd {data.planName}</dd>
                </div>
                <div className="text-right">
                  <dt className="opacity-80">{tc("total")}</dt>
                  <dd className="tabular mt-0.5 text-lg font-bold">{formatMoney(data.amountMinor, data.currency, "en-IN")}</dd>
                </div>
              </dl>
              <RazorpayPay
                keyId={env.RAZORPAY_KEY_ID ?? ""}
                orderId={data.orderId}
                amountMinor={data.amountMinor}
                currency={data.currency}
                amountLabel={formatMoney(data.amountMinor, data.currency, "en-IN")}
                description={`UpayaInd ${data.planName}`}
                prefill={{ name: data.name, email: data.email, contact: data.phone ?? "" }}
              />
              <p className="mt-5 text-[13px] text-muted-foreground">{t("note")}</p>
            </>
          ) : (
            <>
              <h1 className="text-[22px] font-bold tracking-[-0.01em]">{t("notFoundTitle")}</h1>
              <p role="status" className="mt-2 text-[15px] text-muted-foreground">
                {error ?? t("notFoundBody")}
              </p>
              <Link href="/pricing" className={buttonVariants({ className: "mt-6" })}>
                {tc("seePricing")}
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
