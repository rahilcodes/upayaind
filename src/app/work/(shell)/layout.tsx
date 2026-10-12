import { PortalShell } from "@/components/portal/portal-shell";
import { requireStaff } from "@/server/auth/guards";
import { getStaffBadges } from "@/server/services/badges";

export default async function WorkLayout({ children }: { children: React.ReactNode }) {
  const { user, employee } = await requireStaff();
  const badges = await getStaffBadges(user, employee?.id ?? null);
  return (
    <PortalShell portal="work" user={user} badges={badges} subtitle={employee ? `${employee.employeeCode}` : undefined}>
      {children}
    </PortalShell>
  );
}
