import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { AuthHeading, AuthShell } from "@/components/auth/auth-shell";
import { GoogleButton } from "@/components/auth/google-button";
import { integrations } from "@/env";
import { listSignupMarkets, getPlanPriceSummary } from "@/server/services/catalog";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your account", robots: { index: false } };

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const t = await getTranslations("auth");
  const [markets, plan] = await Promise.all([listSignupMarkets(), sp.plan ? getPlanPriceSummary(sp.plan) : null]);
  const cookieMarket = (await cookies()).get("market")?.value;
  const defaultMarket = plan?.marketCode ?? (markets.some((m) => m.code === cookieMarket) ? cookieMarket! : markets[0]?.code ?? "US");
  return (
    <AuthShell>
      <AuthHeading title={t("signupTitle")} subtitle={plan ? t("signupSubtitlePlan", { plan: plan.label }) : t("signupSubtitle")} />
      {integrations.google ? (
        <>
          <GoogleButton label={t("continueWithGoogle")} plan={plan?.id} />
          <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-subtle-foreground">
            <span className="h-px flex-1 bg-border" />
            {t("orContinueWith")}
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}
      <SignupForm markets={markets} defaultMarket={defaultMarket} plan={plan?.id} />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t("haveAccount")}{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          {t("logIn")}
        </Link>
      </p>
    </AuthShell>
  );
}
