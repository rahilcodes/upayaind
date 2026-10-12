import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { exportLeads } from "@/server/services/leads-admin";
import { fileResponse, toCsv, toXlsx } from "@/server/services/admin-export";
import type { Column } from "@/server/services/reports";
import { adminRouteUser, formatOf, paramsOf, stamp } from "../../_auth";

export const dynamic = "force-dynamic";

const COLS: Column[] = [
  { key: "createdAt", type: "text" },
  { key: "name", type: "text" },
  { key: "email", type: "text" },
  { key: "phone", type: "text" },
  { key: "market", type: "text" },
  { key: "source", type: "text" },
  { key: "status", type: "text" },
  { key: "owner", type: "text" },
  { key: "nextFollowUpAt", type: "text" },
  { key: "message", type: "text" },
  { key: "utm", type: "text" },
];

/** CSV/XLSX export of leads (MANAGER/ADMIN). */
export async function GET(req: Request) {
  const user = await adminRouteUser("leads.manage");
  if (user instanceof NextResponse) return user;
  const items = await exportLeads(paramsOf(req), user.id);
  const t = await getTranslations("admin.leads.cols");
  const rows = items.map((l) => ({
    createdAt: l.createdAt.toISOString(),
    name: l.name,
    email: l.email,
    phone: l.phone,
    market: l.marketCode,
    source: l.source,
    status: l.status,
    owner: l.ownerName,
    nextFollowUpAt: l.nextFollowUpAt ? l.nextFollowUpAt.toISOString().slice(0, 10) : null,
    message: l.message,
    utm: l.utm ? Object.entries(l.utm as Record<string, string>).map(([k, v]) => `${k}=${v}`).join("&") : null,
  }));
  const sheet = { title: "Leads", columns: COLS.map((c) => ({ ...c, label: t(c.key as "name") })), rows };
  const format = formatOf(req);
  const name = `upayaind-leads-${stamp()}.${format}`;
  return format === "xlsx" ? fileResponse(await toXlsx(sheet), name, "xlsx") : fileResponse(toCsv(sheet), name, "csv");
}
