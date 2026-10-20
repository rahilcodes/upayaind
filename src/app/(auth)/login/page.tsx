import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthHeading, AuthShell } from "@/components/auth/auth-shell";
import { GoogleButton } from "@/components/auth/google-button";
import { integrations } from "@/env";
import { LoginForm } from "./login-form";
import { MagicLinkForm } from "./magic-link-form";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const t = await getTranslations("auth");
  const team = sp.team === "1" || sp.next?.startsWith("/work") || sp.next?.startsWith("/admin") || sp.next?.startsWith("/coach");
  return (
    <AuthShell variant={team ? "team" : "student"}>
      <AuthHeading title={team ? t("teamLoginTitle") : t("loginTitle")} subtitle={team ? t("teamLoginSubtitle") : t("loginSubtitle")} />
      <LoginForm next={sp.next} team={Boolean(team)} initialError={sp.error} />
      {!team ? (
        <div className="mt-4">
          <MagicLinkForm next={sp.next} />
        </div>
      ) : null}
      {!team && integrations.google ? (
        <>
          <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-subtle-foreground">
            <span className="h-px flex-1 bg-border" />
            {t("orContinueWith")}
            <span className="h-px flex-1 bg-border" />
          </div>
          <GoogleButton label={t("continueWithGoogle")} next={sp.next} />
        </>
      ) : null}
      <div className="mt-6 flex flex-col gap-2 text-center text-sm text-muted-foreground">
        {team ? (
          <Link href="/login" className="font-semibold text-primary hover:underline">
            {t("studentLink")}
          </Link>
        ) : (
          <>
            <p>
              {t("noAccount")}{" "}
              <Link href="/pricing" className="font-semibold text-primary hover:underline">
                {t("createAccount")}
              </Link>
            </p>
            <Link href="/login?team=1" className="text-[13px] hover:underline">
              {t("staffLink")}
            </Link>
          </>
        )}
      </div>
    </AuthShell>
  );
}
