/**
 * Market resolution and country homepages (SPEC §6.1, D-141).
 *
 * Pure, edge-safe helpers shared by the middleware (cookie + `/` rewrite),
 * the marketing chrome (country switcher) and unit tests. No Node or DB
 * imports here: the middleware runs on the edge runtime.
 */

export const SUPPORTED_MARKETS = ["US", "UK", "CA", "AU", "IN"] as const;
export type MarketCode = (typeof SUPPORTED_MARKETS)[number];

/** Markets with their own public homepage. Everyone else gets the US page. */
export const HOME_MARKETS = ["US", "IN", "UK"] as const;
export type HomeMarket = (typeof HOME_MARKETS)[number];

export const DEFAULT_MARKET: HomeMarket = "US";

/** Paths of the country homepages, keyed by market. `/` is the US page. */
export const HOME_PATHS: Record<HomeMarket, string> = { US: "/", IN: "/in", UK: "/uk" };

/** BCP-47 tags for hreflang and the OG `locale`, keyed by market. */
export const HOME_LOCALES: Record<HomeMarket, { hreflang: string; og: string }> = {
  US: { hreflang: "en-US", og: "en_US" },
  IN: { hreflang: "en-IN", og: "en_IN" },
  UK: { hreflang: "en-GB", og: "en_GB" },
};

/** Upper-cases, maps ISO "GB" to our "UK", and rejects unknown codes. */
export function normalizeMarket(code: string | null | undefined): MarketCode | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  const mapped = c === "GB" ? "UK" : c;
  return (SUPPORTED_MARKETS as readonly string[]).includes(mapped) ? (mapped as MarketCode) : null;
}

/** `?market=` override → existing cookie → geo country header → browser language region → US. */
export function resolveMarket(input: { override?: string | null; cookie?: string | null; geo?: string | null; acceptLanguage?: string | null }): MarketCode {
  return normalizeMarket(input.override) ?? normalizeMarket(input.cookie) ?? normalizeMarket(input.geo) ?? normalizeMarket(countryFromAcceptLanguage(input.acceptLanguage)) ?? DEFAULT_MARKET;
}

/**
 * Geo headers we understand, in order: Vercel, Cloudflare, and the generic
 * `X-Country-Code` that our nginx (GeoIP2 / DB-IP) sets on the VPS (D-151).
 */
export const GEO_HEADERS = ["x-vercel-ip-country", "cf-ipcountry", "x-country-code", "x-geo-country"] as const;

export function geoFromHeaders(get: (name: string) => string | null | undefined): string | null {
  for (const h of GEO_HEADERS) {
    const v = get(h)?.trim();
    // "XX"/"ZZ"/"T1" are the "unknown" markers of Cloudflare and GeoIP databases.
    if (v && v.length === 2 && !["XX", "ZZ", "T1"].includes(v.toUpperCase())) return v;
  }
  return null;
}

/**
 * Last-resort hint when no geo header is present: the region of the first
 * `Accept-Language` tag (en-IN → IN, en-GB → GB). Only used before the cookie
 * exists, so a wrong guess is one click away from being fixed in the switcher.
 */
export function countryFromAcceptLanguage(header: string | null | undefined): string | null {
  if (!header) return null;
  const first = header.split(",")[0]?.trim().split(";")[0]?.trim();
  if (!first) return null;
  const parts = first.split("-");
  const region = parts.length >= 2 ? parts[parts.length - 1] : null;
  return region && /^[A-Za-z]{2}$/.test(region) ? region.toUpperCase() : null;
}

export function isHomeMarket(code: string | null | undefined): code is HomeMarket {
  return (HOME_MARKETS as readonly string[]).includes(code ?? "");
}

/** Which homepage a visitor from `market` should see at `/`. Markets without their own page get the US one. */
export function homePathForMarket(market: string | null | undefined): string {
  const m = normalizeMarket(market);
  return m && isHomeMarket(m) ? HOME_PATHS[m] : HOME_PATHS.US;
}

/** Inverse of `homePathForMarket`: the market a country-home path belongs to (null for other paths). */
export function marketForHomePath(pathname: string): HomeMarket | null {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  for (const m of HOME_MARKETS) if (HOME_PATHS[m] === p) return m;
  return null;
}

export function isCountryHomePath(pathname: string) {
  return marketForHomePath(pathname) !== null;
}

/** hreflang map for the three country homepages (`x-default` → US). */
export function homeAlternates(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of HOME_MARKETS) out[HOME_LOCALES[m].hreflang] = HOME_PATHS[m];
  out["x-default"] = HOME_PATHS.US;
  return out;
}
