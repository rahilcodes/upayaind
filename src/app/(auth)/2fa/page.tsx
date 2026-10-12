import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Lock } from "lucide-react";
import { AuthHeading, AuthShell } from "@/components/auth/auth-shell";
import { auth } from "@/server/auth";
import { isStaff, portalForRole } from "@/server/auth/rbac";
import { beginTotpSetup } from "@/server/services/accounts";
import { TotpForm } from "./totp-form";

export const metadata: Metadata = { title: "Two-step verification", robots: { index: false } };

export default async function TwoFactorPage() {
  const session = await auth();
  if (!session?.user?.id || !isStaff(session.user.role)) redirect("/login");
  if (session.user.mfa === "ok") redirect(portalForRole(session.user.role));
  const t = await getTranslations("auth");
  const setup = session.user.mfa === "setup" ? await beginTotpSetup(session.user.id) : null;
  return (
    <AuthShell variant="team">
      <div className="mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-accent text-accent-foreground">
        <Lock className="h-6 w-6" aria-hidden="true" />
      </div>
      <AuthHeading title={setup ? t("twofaSetupTitle") : t("twofaTitle")} subtitle={setup ? t("twofaSetupSubtitle") : t("twofaSubtitle")} />
      {setup ? (
        <div className="mb-6 flex flex-col items-center gap-3 rounded-[14px] border border-border bg-surface-muted p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.dataUrl} alt="QR code for your authenticator app" width={200} height={200} className="rounded-lg bg-white p-2" />
          <p className="text-center text-[13px] text-muted-foreground">{t("twofaManual")}</p>
          <code className="select-all break-all rounded-md bg-surface px-3 py-2 text-center font-mono text-sm tracking-wider">
            {setup.secret.match(/.{1,4}/g)?.join(" ")}
          </code>
        </div>
      ) : null}
      <TotpForm />
    </AuthShell>
  );
}
