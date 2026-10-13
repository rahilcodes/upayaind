import { PortalShell } from "@/components/portal/portal-shell";
import { PortalObservability } from "@/components/observability/portal-observability";
import { requireRole } from "@/server/auth/guards";
import { getStaffBadges } from "@/server/services/badges";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const badges = await getStaffBadges(user, null);
  return (
    <PortalShell portal="admin" user={user} badges={badges}>
      <PortalObservability user={user} />
      {children}
    </PortalShell>
  );
}
