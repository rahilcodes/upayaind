import { NextResponse } from "next/server";
import { routeUser } from "@/app/api/resumes/_auth";
import { linkableApplications } from "@/server/services/messaging";
import { messagingError } from "../../_shared";

export const dynamic = "force-dynamic";

/** Applications the composer can attach as a card (the thread's student only). */
export async function GET(_req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const user = await routeUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { threadId } = await params;
  try {
    return NextResponse.json({ items: await linkableApplications(user, threadId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return messagingError(e);
  }
}
