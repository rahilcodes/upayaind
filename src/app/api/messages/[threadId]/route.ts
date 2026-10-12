import { NextResponse } from "next/server";
import { routeUser } from "@/app/api/resumes/_auth";
import { getThread, getThreadForAdmin, sendMessage, threadAccess } from "@/server/services/messaging";
import { fileToBuffer } from "@/server/services/files";
import { messagingError, serializeThread } from "../_shared";

export const dynamic = "force-dynamic";

/** Thread view (polled every 15 s while open). Participants' reads set read receipts; observers never do. */
export async function GET(_req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const user = await routeUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { threadId } = await params;
  try {
    const access = await threadAccess(user, threadId);
    const view = access.side === "observer" ? await getThreadForAdmin(user, threadId) : await getThread(user, threadId);
    return NextResponse.json(serializeThread(view), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return messagingError(e);
  }
}

/** Send a message (multipart: body, applicationId?, files[] ≤ 3 × 10 MB). */
export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const user = await routeUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { threadId } = await params;
  try {
    const fd = await req.formData();
    const files = fd.getAll("files").filter((f): f is File => typeof f !== "string");
    const attachments = [];
    for (const f of files.slice(0, 4)) {
      const b = await fileToBuffer(f);
      if (b) attachments.push(b);
    }
    const appId = fd.get("applicationId");
    const m = await sendMessage(user, { threadId, body: String(fd.get("body") ?? ""), applicationId: typeof appId === "string" && appId ? appId : null }, attachments);
    return NextResponse.json({ id: m.id, createdAt: m.createdAt.toISOString() });
  } catch (e) {
    return messagingError(e);
  }
}
