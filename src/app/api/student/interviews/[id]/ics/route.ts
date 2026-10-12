import { NextResponse } from "next/server";
import { getStudentInterview } from "@/server/services/student-applications";
import { buildIcs } from "@/lib/ics";
import { absoluteUrl } from "@/lib/utils";
import { formatInTz } from "@/lib/format";
import { attachmentName, routeStudent } from "../../../_auth";

export const dynamic = "force-dynamic";

/** Add-to-calendar file for one of the student's interviews (SPEC F6). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await routeStudent();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const i = await getStudentInterview(user, id);
  if (!i) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const summary = `Interview: ${i.application.jobTitle} at ${i.application.companyName}`;
  const description = [
    `Round: ${i.round}`,
    `Mode: ${i.mode}`,
    `Time: ${formatInTz(i.scheduledAt, i.timezone, "EEE d MMM yyyy, h:mm a")} (${i.timezone})`,
    i.interviewers ? `Interviewers: ${i.interviewers}` : null,
    i.meetingLink ? `Join: ${i.meetingLink}` : null,
    i.prepNotes ? `Prep notes: ${i.prepNotes}` : null,
    `Details: ${absoluteUrl(`/app/applications/${i.application.id}`)}`,
  ]
    .filter(Boolean)
    .join("\n");
  const ics = buildIcs([{ uid: `interview-${i.id}@upayaind.com`, start: i.scheduledAt, durationMinutes: 60, summary, description, location: i.mode === "Onsite" ? i.application.companyName : i.meetingLink, url: i.meetingLink }], { name: "UpayaInd interviews" });
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${attachmentName(`interview-${i.application.companyName}`)}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
