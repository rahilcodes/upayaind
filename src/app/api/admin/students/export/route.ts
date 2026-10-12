import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { exportStudents } from "@/server/services/admin-students";
import { fileResponse, toCsv, toXlsx } from "@/server/services/admin-export";
import type { Column } from "@/server/services/reports";
import { adminRouteUser, formatOf, paramsOf, stamp } from "../../_auth";

export const dynamic = "force-dynamic";

const COLS: Column[] = [
  { key: "name", type: "text" },
  { key: "email", type: "text" },
  { key: "market", type: "text" },
  { key: "plan", type: "text" },
  { key: "status", type: "text" },
  { key: "periodEnd", type: "text" },
  { key: "employee", type: "text" },
  { key: "todayApplied", type: "int" },
  { key: "todayTarget", type: "int" },
  { key: "applications", type: "int" },
  { key: "interviews", type: "int" },
  { key: "onboarded", type: "text" },
  { key: "createdAt", type: "text" },
];

/** CSV/XLSX export of the filtered students list (MANAGER/ADMIN). */
export async function GET(req: Request) {
  const user = await adminRouteUser("students.view_all");
  if (user instanceof NextResponse) return user;
  const items = await exportStudents(paramsOf(req), user.id);
  const t = await getTranslations("admin.students.cols");
  const rows = items.map((s) => ({
    name: s.name,
    email: s.email,
    market: s.market,
    plan: s.plan,
    status: s.status ?? "NONE",
    periodEnd: s.periodEnd ? s.periodEnd.toISOString().slice(0, 10) : null,
    employee: s.employee,
    todayApplied: s.today?.applied ?? null,
    todayTarget: s.today?.target ?? null,
    applications: s.applications,
    interviews: s.interviews,
    onboarded: s.onboarded ? "yes" : "no",
    createdAt: s.createdAt.toISOString(),
  }));
  const sheet = { title: "Students", columns: COLS.map((c) => ({ ...c, label: t(c.key as "name") })), rows };
  const format = formatOf(req);
  const name = `upayaind-students-${stamp()}.${format}`;
  return format === "xlsx" ? fileResponse(await toXlsx(sheet), name, "xlsx") : fileResponse(toCsv(sheet), name, "csv");
}
