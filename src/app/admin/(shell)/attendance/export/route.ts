import { NextResponse } from "next/server";
import { routeUser } from "@/app/api/resumes/_auth";
import { exportTimesheets } from "@/server/services/attendance";
import { isManagerial } from "@/server/auth/rbac";

export const dynamic = "force-dynamic";

const key = /^\d{4}-\d{2}-\d{2}$/;

/** CSV / XLSX timesheet export (MANAGER/ADMIN). */
export async function GET(req: Request) {
  const user = await routeUser();
  if (!user || !isManagerial(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  if (!key.test(from) || !key.test(to) || to < from) return NextResponse.json({ error: "Pick a valid date range." }, { status: 400 });
  const format = sp.get("format") === "xlsx" ? "xlsx" : "csv";
  const { body, mime, ext } = await exportTimesheets({ from, to, employeeId: sp.get("employee") || null }, format);
  return new NextResponse(new Uint8Array(body), {
    headers: { "Content-Type": mime, "Content-Disposition": `attachment; filename="timesheets-${from}-to-${to}.${ext}"`, "Cache-Control": "no-store" },
  });
}
