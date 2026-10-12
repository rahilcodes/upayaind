import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthHeading, AuthShell, FormAlert } from "@/components/auth/auth-shell";
import { peekToken } from "@/server/services/auth-tokens";
import { SetPasswordForm } from "../reset-password/set-password-form";

export const metadata: Metadata = { title: "Activate your account", robots: { index: false } };

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const t = await getTranslations("auth");
  const valid = await peekToken(token, "INVITE");
  return (
    <AuthShell variant="team">
      <AuthHeading title={t("inviteTitle")} subtitle={valid ? t("inviteSubtitle") : undefined} />
      {valid ? <SetPasswordForm token={token} mode="invite" /> : <FormAlert>{t("resetInvalid")}</FormAlert>}
    </AuthShell>
  );
}
