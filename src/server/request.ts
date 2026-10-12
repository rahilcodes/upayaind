import "server-only";
import { headers } from "next/headers";

/** Client IP + user agent of the current request (best effort behind Vercel/proxies). */
export async function requestMeta() {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0]!.trim() : null) ?? h.get("x-real-ip") ?? null;
  return { ip, userAgent: h.get("user-agent"), country: h.get("x-vercel-ip-country") };
}
