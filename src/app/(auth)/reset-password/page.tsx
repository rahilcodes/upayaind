import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthHeading, AuthShell, FormAlert } from "@/components/auth/auth-shell";
import { peekToken } from "@/server/services/auth-tokens";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const t = await getTranslations("auth");
  const valid = await peekToken(token, "RESET_PASSWORD");
  return (
    <AuthShell>
      <AuthHeading title={t("resetTitle")} />
      {valid ? (
        <SetPasswordForm token={token} mode="reset" />
      ) : (
        <div className="flex flex-col gap-5">
          <FormAlert>{t("resetInvalid")}</FormAlert>
          <Link href="/forgot-password" className="text-center text-sm font-semibold text-primary hover:underline">
            {t("requestNew")}
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
