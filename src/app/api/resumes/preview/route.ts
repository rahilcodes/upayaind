import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/server/db";
import { canAccessVersion, renderPreviewPages } from "@/server/services/resumes";
import { errorResponse, routeUser } from "../_auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  studentId: z.string().min(1),
  content: z.unknown().optional(),
  versionId: z.string().min(1).optional(),
  format: z.enum(["png", "pdf"]).default("png"),
});

/**
 * Live preview for the workspace editor (< 1.5 s): renders POSTed (unsaved)
 * resume JSON — or a saved version — with the student's market style and
 * template, and returns page images (the global CSP forbids framing PDFs, see
 * docs/DECISIONS.md) or the raw PDF with format=pdf. Nothing is stored.
 */
export async function POST(req: Request) {
  const user = await routeUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const t0 = Date.now();
  try {
    let content = parsed.data.content;
    let styleCode: string | undefined;
    let templateCode: string | undefined;
    if (!content && parsed.data.versionId) {
      const v = await db.resumeVersion.findUnique({ where: { id: parsed.data.versionId }, select: { id: true, studentId: true, content: true, styleCode: true, templateCode: true } });
      if (!v || v.studentId !== parsed.data.studentId || !(await canAccessVersion(user, v))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      content = v.content;
      styleCode = v.styleCode;
      templateCode = v.templateCode;
    }
    if (!content) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    const r = await renderPreviewPages(user, { studentId: parsed.data.studentId, content, styleCode, templateCode });
    if (parsed.data.format === "pdf") {
      return new NextResponse(new Uint8Array(r.pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=preview.pdf", "Cache-Control": "no-store" } });
    }
    return NextResponse.json(
      {
        pageCount: r.pages,
        pages: r.images.map((p) => ({ src: `data:image/png;base64,${p.data.toString("base64")}`, width: p.width, height: p.height })),
        ms: Date.now() - t0,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
