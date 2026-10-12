import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { exportAllApplications } from "@/server/services/admin-applications";
import { fileResponse, toCsv, toXlsx } from "@/server/services/admin-export";
import type { Column } from "@/server/services/reports";
import { adminRouteUser, formatOf, paramsOf, stamp } from "../../_auth";

export const dynamic = "force-dynamic";

const COLS: Column[] = [
  { key: "appliedAt", type: "text" },
  { key: "student", type: "text" },
  { key: "market", type: "text" },
  { key: "company", type: "text" },
  { key: "title", type: "text" },
  { key: "location", type: "text" },
  { key: "source", type: "text" },
  { key: "status", type: "text" },
  { key: "employee", type: "text" },
  { key: "jobUrl", type: "text" },
  { key: "resumeVersionId", type: "text" },
];

/** CSV/XLSX export of all applications matching the filters (MANAGER/ADMIN). */
export async function GET(req: Request) {
  const user = await adminRouteUser("students.view_all");
  if (user instanceof NextResponse) return user;
  const items = await exportAllApplications(paramsOf(req), user.id);
  const t = await getTranslations("admin.applications.cols");
  const rows = items.map((a) => ({
    appliedAt: a.appliedAt?.toISOString() ?? null,
    student: a.student.user.name,
    market: a.student.market.code,
    company: a.companyName,
    title: a.jobTitle,
    location: a.location,
    source: a.source,
    status: a.status,
    employee: a.employee.user.name,
    jobUrl: a.jobUrl,
    resumeVersionId: a.resumeVersionId,
  }));
  const sheet = { title: "Applications", columns: COLS.map((c) => ({ ...c, label: t(c.key as "company") })), rows };
  const format = formatOf(req);
  const name = `upayaind-applications-${stamp()}.${format}`;
  return format === "xlsx" ? fileResponse(await toXlsx(sheet), name, "xlsx") : fileResponse(toCsv(sheet), name, "csv");
}
