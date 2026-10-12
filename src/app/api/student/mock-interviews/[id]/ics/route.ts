import { NextResponse } from "next/server";
import { getStudentMock } from "@/server/services/prep";
import { buildIcs } from "@/lib/ics";
import { absoluteUrl } from "@/lib/utils";
import { routeStudent } from "../../../_auth";

export const dynamic = "force-dynamic";

/** Add-to-calendar file for a booked mock interview (SPEC F12). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await routeStudent();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const m = await getStudentMock(user, id);
  if (!m) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const ics = buildIcs([
    {
      uid: `mock-${m.id}@upayaind.com`,
      start: m.scheduledAt,
      durationMinutes: m.durationMin,
      summary: `Mock interview: ${m.focus ?? "Practice session"} (UpayaInd)`,
      description: [m.meetingLink ? `Join: ${m.meetingLink}` : "Your coach will share the meeting link before the session.", `Details: ${absoluteUrl("/app/prep")}`].join("\n"),
      location: m.meetingLink,
      url: m.meetingLink,
    },
  ]);
  return new NextResponse(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="mock-interview.ics"', "Cache-Control": "private, no-store" } });
}
