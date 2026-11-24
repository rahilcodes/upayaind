import { absoluteUrl } from "@/lib/utils";

/**
 * IndexNow (D-172): tells Bing, Yandex, Seznam, Naver and the other participating search engines
 * that a public URL was published or changed, so it is recrawled in minutes instead of days.
 * Google does not take part; it relies on the sitemap.
 *
 * Off unless `INDEXNOW_KEY` is set. The key is public by design: it is served at /indexnow.txt
 * so the engines can check that the site owns it. `pingIndexNow()` is fire-and-forget: it never
 * throws and times out after 5 s, so a CMS save is never slowed down or failed by it.
 */

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const INDEXNOW_KEY_PATH = "/indexnow.txt";
const KEY_RE = /^[A-Za-z0-9-]{8,128}$/;

export function indexNowKey(raw: string | undefined | null = process.env.INDEXNOW_KEY): string | null {
  const k = raw?.trim();
  return k && KEY_RE.test(k) ? k : null;
}

/** Request body for a list of site paths; null when there is nothing valid to send. Pure, unit-tested. */
export function buildIndexNowBody(paths: string[], opts: { key: string | null; origin: string }) {
  if (!opts.key) return null;
  let site: URL;
  try {
    site = new URL(opts.origin);
  } catch {
    return null;
  }
  // Search engines can't reach a local or plain-http site.
  if (site.protocol !== "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(site.hostname)) return null;
  const urlList = [...new Set(paths.filter((p) => p.startsWith("/") && !p.startsWith("//")).map((p) => new URL(p, site).toString()))].slice(0, 10_000);
  if (!urlList.length) return null;
  return { host: site.host, key: opts.key, keyLocation: new URL(INDEXNOW_KEY_PATH, site).toString(), urlList };
}

export async function pingIndexNow(paths: string[], opts: { fetch?: typeof fetch; key?: string | null; origin?: string } = {}): Promise<"sent" | "skipped" | "failed"> {
  try {
    const body = buildIndexNowBody(paths, { key: opts.key === undefined ? indexNowKey() : opts.key, origin: opts.origin ?? absoluteUrl("/") });
    if (!body) return "skipped";
    const res = await (opts.fetch ?? fetch)(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error(`[indexnow] ${res.status} for ${body.urlList.length} URL(s)`);
      return "failed";
    }
    return "sent";
  } catch (e) {
    console.error("[indexnow] ping failed", e instanceof Error ? e.message : e);
    return "failed";
  }
}
