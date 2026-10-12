import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import { AuthShell, FormAlert } from "@/components/auth/auth-shell";
import { buttonVariants } from "@/components/ui/button";
import { verifyEmail } from "@/server/services/accounts";
import { auth } from "@/server/auth";
import { ResendVerification } from "./resend";

export const metadata: Metadata = { title: "Confirm email", robots: { index: false } };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const t = await getTranslations("auth");
  const userId = token ? await verifyEmail(token) : null;
  const session = await auth();
  return (
    <AuthShell>
      {userId ? (
        <div className="flex flex-col items-start gap-4">
          <CheckCircle2 className="h-12 w-12 text-success" aria-hidden="true" />
          <h1 className="text-[26px] font-bold">{t("verifyTitle")}</h1>
          <p className="text-muted-foreground">{t("verifyBody")}</p>
          <Link href={session?.user ? "/app" : "/login"} className={buttonVariants({ size: "lg", className: "w-full" })}>
            {t("continue")}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <h1 className="text-[26px] font-bold">{t("verifyInvalidTitle")}</h1>
          <FormAlert>{t("verifyInvalidBody")}</FormAlert>
          {session?.user ? <ResendVerification label={t("resendVerification")} done={t("verificationSent")} /> : (
            <Link href="/login" className="text-center text-sm font-semibold text-primary hover:underline">{t("logIn")}</Link>
          )}
        </div>
      )}
    </AuthShell>
  );
}
