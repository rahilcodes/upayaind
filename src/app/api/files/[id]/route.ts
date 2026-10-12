import { NextResponse } from "next/server";
import { currentUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { readObject, signedUrl } from "@/server/services/files";
import { canAccessFile } from "@/server/services/file-access";

export const dynamic = "force-dynamic";

/** Permission-checked file download → 302 to a 5-minute signed URL (or streamed locally in dev). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const file = await db.fileObject.findUnique({ where: { id }, select: { key: true, ownerUserId: true, studentId: true, purpose: true, mime: true, filename: true } });
  if (!file) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const user = await currentUser();
  if (!(await canAccessFile(user, file))) return NextResponse.json({ error: "forbidden" }, { status: user ? 403 : 401 });

  const inline = new URL(req.url).searchParams.get("inline") === "1";
  const name = file.filename ?? file.key.split("/").pop() ?? "file";
  const url = await signedUrl(file.key, name, inline);
  if (url) return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });

  const body = await readObject(file.key);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
