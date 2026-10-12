import { NextResponse } from "next/server";
import { exportApplicationsCsv } from "@/server/services/student-applications";
import { formatInTz } from "@/lib/format";
import { routeStudent } from "../../_auth";

export const dynamic = "force-dynamic";

/** CSV export of /app/applications with the same filters (SPEC F6). */
export async function GET(req: Request) {
  const user = await routeStudent();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  delete sp.after;
  delete sp.before;
  const csv = await exportApplicationsCsv(user, sp, new URL(req.url).origin);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="upayaind-applications-${formatInTz(new Date(), user.timezone, "yyyy-MM-dd")}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
