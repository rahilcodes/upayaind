import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/** Bell icon feed: latest 20 notifications + unread count for the signed-in user. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [items, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, title: true, body: true, link: true, readAt: true, createdAt: true, type: true },
    }),
    db.notification.count({ where: { userId: session.user.id, readAt: null } }),
  ]);
  return NextResponse.json({ items, unread }, { headers: { "Cache-Control": "no-store" } });
}

const markSchema = z.object({ ids: z.array(z.string()).max(100).optional(), all: z.boolean().optional() });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = markSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  await db.notification.updateMany({
    where: { userId: session.user.id, readAt: null, ...(body.data.all ? {} : { id: { in: body.data.ids ?? [] } }) },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
