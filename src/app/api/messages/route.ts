import { NextResponse } from "next/server";
import { routeUser } from "@/app/api/resumes/_auth";
import { listAllThreadsForAdmin, listStaffThreads, listStudentThreads } from "@/server/services/messaging";
import { messagingError } from "./_shared";

export const dynamic = "force-dynamic";

/** Inbox for the signed-in user (polled every 15 s by the messages pages). `?all=1` → managers' read-only list. */
export async function GET(req: Request) {
  const user = await routeUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.slice(0, 100) || undefined;
    const items =
      user.role === "STUDENT"
        ? await listStudentThreads(user)
        : url.searchParams.get("all") === "1"
          ? await listAllThreadsForAdmin(user, { q })
          : await listStaffThreads(user, { q });
    return NextResponse.json({ items: items.map((i) => ({ ...i, last: i.last ? { ...i.last, at: i.last.at.toISOString() } : null })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return messagingError(e);
  }
}
