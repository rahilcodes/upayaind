import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { readObject, signedUrl } from "@/server/services/files";
import { canAccessVersion, ensureRendered } from "@/server/services/resumes";
import { errorResponse, routeUser } from "../../_auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Resume download / preview (SPEC §9.6, F6 "exact resume used").
 * GET /api/resumes/{versionId}/{pdf|docx}[?inline=1]
 * Permission: student owner, actively assigned employee, an employee who logged
 * an application with this version, managers and admins. Renders on demand and
 * caches the file in storage (pdfKey/docxKey), then redirects to a 5-minute
 * signed URL (R2) or streams it (local storage).
 */
export async function GET(req: Request, { params }: { params: Promise<{ versionId: string; format: string }> }) {
  const { versionId, format } = await params;
  if (format !== "pdf" && format !== "docx") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const user = await routeUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const version = await db.resumeVersion.findUnique({ where: { id: versionId }, select: { id: true, studentId: true } });
  if (!version) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await canAccessVersion(user, version))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const inline = new URL(req.url).searchParams.get("inline") === "1" && format === "pdf";
    const r = await ensureRendered(versionId, format);
    const url = await signedUrl(r.key, r.filename, inline);
    if (url) return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
    const body = "buffer" in r && r.buffer ? r.buffer : await readObject(r.key);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": r.mime,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${r.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
