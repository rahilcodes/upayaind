import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { audit } from "@/server/services/audit";
import { fileResponse, toCsv, toXlsx } from "@/server/services/admin-export";
import { REPORT_KEYS, resolveRange, runReport, type ReportKey } from "@/server/services/reports";
import { adminRouteUser, formatOf, paramsOf, stamp } from "../../_auth";

export const dynamic = "force-dynamic";

/** GET /api/admin/reports/{report}?from&to&market&format=csv|xlsx (MANAGER/ADMIN). */
export async function GET(req: Request, { params }: { params: Promise<{ report: string }> }) {
  const user = await adminRouteUser("reports.view");
  if (user instanceof NextResponse) return user;
  const { report } = await params;
  if (!REPORT_KEYS.includes(report as ReportKey)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const range = resolveRange(paramsOf(req), user.timezone);
  const table = await runReport(report as ReportKey, range);
  const t = await getTranslations("admin.reports");
  const format = formatOf(req);
  const sheet = {
    title: t(`tabs.${report}` as "tabs.revenue"),
    columns: table.columns.map((c) => ({ ...c, label: t(`cols.${c.key}` as "cols.month") })),
    rows: table.rows,
  };
  await audit({ actorId: user.id, action: "export.report", entity: "Report", entityId: report, after: { format, from: range.fromKey, to: range.toKey, market: range.market ?? null, rows: table.rows.length } });
  const name = `upayaind-${report}-${range.fromKey}_${range.toKey}-${stamp()}.${format}`;
  return format === "xlsx" ? fileResponse(await toXlsx(sheet), name, "xlsx") : fileResponse(toCsv(sheet), name, "csv");
}
