import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthHeading, AuthShell, FormAlert } from "@/components/auth/auth-shell";
import { isStaff } from "@/server/auth/rbac";
import { peekTokenOwner } from "@/server/services/auth-tokens";
import { SetPasswordForm } from "../reset-password/set-password-form";

export const metadata: Metadata = { title: "Activate your account", robots: { index: false } };

/** Invite landing: staff get team copy (2FA follows); students created by the team (D-147) get student copy. */
export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const t = await getTranslations("auth");
  const owner = await peekTokenOwner(token, "INVITE");
  const student = Boolean(owner && !isStaff(owner.role));
  return (
    <AuthShell variant={student ? "student" : "team"}>
      <AuthHeading title={student ? t("inviteStudentTitle") : t("inviteTitle")} subtitle={owner ? (student ? t("inviteStudentSubtitle") : t("inviteSubtitle")) : undefined} />
      {owner ? <SetPasswordForm token={token} mode="invite" /> : <FormAlert>{t("resetInvalid")}</FormAlert>}
    </AuthShell>
  );
}
