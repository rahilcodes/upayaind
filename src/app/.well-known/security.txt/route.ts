import { absoluteUrl } from "@/lib/utils";

/**
 * RFC 9116 security.txt (DECISIONS D-134). Static; `Expires` is a year from the
 * build so the file never advertises a stale contact for long.
 */
export const dynamic = "force-static";

export function GET() {
  const expires = new Date();
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);
  const body = [
    "Contact: mailto:security@upayaind.com",
    `Contact: ${absoluteUrl("/contact")}`,
    `Expires: ${expires.toISOString()}`,
    "Preferred-Languages: en",
    `Canonical: ${absoluteUrl("/.well-known/security.txt")}`,
    `Policy: ${absoluteUrl("/legal/privacy")}`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
