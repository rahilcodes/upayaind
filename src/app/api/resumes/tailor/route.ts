import { z } from "zod";
import { NextResponse } from "next/server";
import { tailorResume, type TailorStep } from "@/server/services/resumes";
import { errorResponse, routeUser } from "../_auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  studentId: z.string().min(1),
  jd: z.string().max(20_000),
  company: z.string().trim().min(1, "Company is required.").max(200),
  title: z.string().trim().min(1, "Job title is required.").max(200),
  location: z.string().trim().max(200).optional().nullable(),
});

/**
 * Tailoring with streamed progress (F4 "Generation"). Streams NDJSON lines:
 *   {"type":"step","step":"analysing"} … {"type":"result", …} | {"type":"error","error":"…"}
 * Runs in the request (not Inngest) so the employee sees each step live; the
 * whole pipeline targets < 60 s. See docs/DECISIONS.md.
 */
export async function POST(req: Request) {
  const user = await routeUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role === "STUDENT") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "bad_request" }, { status: 400 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(`${JSON.stringify(obj)}\n`));
      try {
        const r = await tailorResume(user, parsed.data, (step: TailorStep) => send({ type: "step", step }));
        send({
          type: "result",
          versionId: r.versionId,
          content: r.content,
          analysis: r.analysis,
          validation: r.validation,
          base: r.base,
          tailored: r.tailored,
          pages: r.pages,
          aiUnavailable: r.aiUnavailable,
        });
      } catch (e) {
        const res = errorResponse(e);
        const body = (await res.json()) as { error: string };
        send({ type: "error", error: body.error, status: res.status });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
