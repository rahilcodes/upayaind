import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { AuthHeading, AuthShell } from "@/components/auth/auth-shell";
import { auth } from "@/server/auth";
import { listSignupMarkets } from "@/server/services/catalog";
import { CompleteProfileForm } from "../signup-form";

export const metadata: Metadata = { title: "Complete your profile", robots: { index: false } };

export default async function CompletePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "STUDENT" || !session.user.needsProfile) redirect("/app");
  const sp = await searchParams;
  const t = await getTranslations("auth");
  const markets = await listSignupMarkets();
  const cookieMarket = (await cookies()).get("market")?.value;
  return (
    <AuthShell>
      <AuthHeading title={t("completeTitle")} subtitle={t("completeSubtitle")} />
      <CompleteProfileForm markets={markets} defaultMarket={markets.some((m) => m.code === cookieMarket) ? cookieMarket! : "US"} plan={sp.plan} />
    </AuthShell>
  );
}
