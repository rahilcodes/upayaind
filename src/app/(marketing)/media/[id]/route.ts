import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { readObject } from "@/server/services/files";

/**
 * Public CMS images (purpose "cms" only). Same-origin so they work with the
 * strict CSP (img-src 'self') and next/image; cached hard because uploads are
 * immutable (a new upload gets a new id).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const file = await db.fileObject.findUnique({ where: { id }, select: { key: true, mime: true, purpose: true } });
  if (!file || file.purpose !== "cms" || !/^image\/(png|jpeg)$/.test(file.mime)) return new NextResponse("Not found", { status: 404 });
  const body = await readObject(file.key);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
