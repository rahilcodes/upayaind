import { NextResponse } from "next/server";
import { buildStudentExport, buildStudentExportZip } from "@/server/services/student-privacy";
import { RateLimitError } from "@/server/services/ratelimit";
import { requestMeta } from "@/server/request";
import { formatInTz } from "@/lib/format";
import { routeStudent } from "../_auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Personal data export (SPEC §10): ?format=zip (default) → data.json + all
 * stored files; ?format=json → data.json only. Secrets are never included.
 */
export async function GET(req: Request) {
  const user = await routeStudent();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const format = new URL(req.url).searchParams.get("format") === "json" ? "json" : "zip";
  const stamp = formatInTz(new Date(), user.timezone, "yyyy-MM-dd");
  try {
    if (format === "json") {
      const { _fileKeys, ...data } = await buildStudentExport(user);
      void _fileKeys;
      return new NextResponse(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="upayaind-data-${stamp}.json"`, "Cache-Control": "private, no-store" } });
    }
    const { ip } = await requestMeta();
    const zip = await buildStudentExportZip(user, ip);
    return new NextResponse(new Uint8Array(zip), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="upayaind-data-${stamp}.zip"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof RateLimitError) return NextResponse.json({ error: e.message }, { status: 429 });
    throw e;
  }
}
