import { PortalShell } from "@/components/portal/portal-shell";
import { PortalObservability } from "@/components/observability/portal-observability";
import { requireRole } from "@/server/auth/guards";
import { getStaffBadges } from "@/server/services/badges";
import { getTranslations } from "next-intl/server";
import { AlertTriangle } from "lucide-react";
import { emailTransport, env } from "@/env";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const badges = await getStaffBadges(user, null);
  // Emails only reach the console when neither Resend nor SMTP is configured (D-150): tell admins loudly.
  const emailBroken = user.role === "ADMIN" && env.NODE_ENV === "production" && emailTransport === "console";
  const t = emailBroken ? await getTranslations("admin.common") : null;
  return (
    <PortalShell portal="admin" user={user} badges={badges}>
      <PortalObservability user={user} />
      {t ? (
        <p role="alert" className="mb-5 flex items-start gap-2 rounded-[12px] border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <span>{t("emailNotConfigured")}</span>
        </p>
      ) : null}
      {children}
    </PortalShell>
  );
}
