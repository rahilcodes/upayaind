import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthHeading, AuthShell } from "@/components/auth/auth-shell";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default async function ForgotPage() {
  const t = await getTranslations("auth");
  return (
    <AuthShell>
      <AuthHeading title={t("forgotTitle")} subtitle={t("forgotSubtitle")} />
      <ForgotForm />
    </AuthShell>
  );
}
