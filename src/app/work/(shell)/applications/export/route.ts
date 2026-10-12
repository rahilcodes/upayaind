import { NextResponse } from "next/server";
import { routeUser } from "@/app/api/resumes/_auth";
import { isStaff } from "@/server/auth/rbac";
import { exportMyApplications } from "@/server/services/work-dashboard";

export const dynamic = "force-dynamic";

/** CSV export of the applications I logged (same filters as the list). */
export async function GET(req: Request) {
  const user = await routeUser();
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  delete sp.cursor;
  const { body, filename } = await exportMyApplications(user, sp);
  return new NextResponse(new Uint8Array(body), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });
}
