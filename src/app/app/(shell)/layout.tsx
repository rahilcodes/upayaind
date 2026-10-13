import { PortalShell } from "@/components/portal/portal-shell";
import { PortalObservability } from "@/components/observability/portal-observability";
import { PwaRegister } from "@/components/student/pwa-register";
import { requireStudent } from "@/server/auth/guards";
import { getStudentBadges } from "@/server/services/badges";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { user, student } = await requireStudent();
  const badges = await getStudentBadges(user.id, student.id);
  return (
    <PortalShell portal="app" user={user} badges={badges}>
      <PwaRegister />
      <PortalObservability user={user} />
      {children}
    </PortalShell>
  );
}
