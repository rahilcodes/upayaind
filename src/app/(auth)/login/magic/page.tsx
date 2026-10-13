import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthHeading, AuthShell } from "@/components/auth/auth-shell";
import { buttonVariants } from "@/components/ui/button";
import { magicLinkIsValid } from "@/server/services/magic-link";
import { MagicLoginForm } from "./magic-login-form";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Landing page for the emailed login link. The token is consumed by a POST
 * (button) rather than on GET so link scanners / previews can't burn it.
 */
export default async function MagicLoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const t = await getTranslations("auth.magic");
  const token = sp.token ?? "";
  const valid = token ? await magicLinkIsValid(token) : false;
  return (
    <AuthShell>
      {valid ? (
        <>
          <AuthHeading title={t("landingTitle")} subtitle={t("landingSubtitle")} />
          <MagicLoginForm token={token} next={sp.next} />
        </>
      ) : (
        <>
          <AuthHeading title={t("expiredTitle")} subtitle={t("expiredBody")} />
          <Link href="/login" className={buttonVariants({ size: "lg", className: "w-full" })}>
            {t("backToLogin")}
          </Link>
        </>
      )}
    </AuthShell>
  );
}
