import { PortalShell } from "@/components/portal/portal-shell";
import { PortalObservability } from "@/components/observability/portal-observability";
import { Heartbeat } from "@/components/attendance/heartbeat";
import { requireRole } from "@/server/auth/guards";
import { coachContext } from "@/server/services/coach";
import { db } from "@/server/db";

/** /coach — the interview coach portal (D-140). COACH, plus ADMIN for oversight. */
export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["COACH", "ADMIN"]);
  const ctx = await coachContext(user);
  const emp = ctx.employeeId ? await db.employeeProfile.findUnique({ where: { id: ctx.employeeId }, select: { employeeCode: true } }) : null;
  return (
    <PortalShell portal="coach" user={user} subtitle={emp?.employeeCode}>
      <Heartbeat />
      <PortalObservability user={user} />
      {children}
    </PortalShell>
  );
}
