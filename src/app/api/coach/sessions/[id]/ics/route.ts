import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { can } from "@/server/auth/rbac";
import { coachContext, getCoachSession } from "@/server/services/coach";
import { buildIcs } from "@/lib/ics";
import { absoluteUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Add-to-calendar file for one of the coach's own sessions (D-140). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const u = session?.user;
  if (!u?.id || !can(u.role, "coach.sessions") || u.mfa !== "ok") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ctx = await coachContext({ id: u.id, role: u.role });
  const m = await getCoachSession(ctx, id);
  if (!m || m.status !== "SCHEDULED") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const ics = buildIcs([
    {
      uid: `mock-${m.id}@upayaind.com`,
      start: m.scheduledAt,
      durationMinutes: m.durationMin,
      summary: `Mock interview: ${m.focus ?? "Practice session"}${m.student ? ` with ${m.student.name}` : ""} (UpayaInd)`,
      description: [m.meetingLink ? `Join: ${m.meetingLink}` : null, `Details: ${absoluteUrl("/coach/sessions")}`].filter(Boolean).join("\n"),
      location: m.meetingLink,
      url: m.meetingLink,
    },
  ]);
  return new NextResponse(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="mock-interview.ics"', "Cache-Control": "private, no-store" } });
}
