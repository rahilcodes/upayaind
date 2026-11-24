import { indexNowKey } from "@/server/services/indexnow";

/**
 * IndexNow key file (D-172). Search engines fetch it to confirm that the site owns the key
 * sent with each ping. 404 while `INDEXNOW_KEY` is not set.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const key = indexNowKey();
  if (!key) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(key, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
