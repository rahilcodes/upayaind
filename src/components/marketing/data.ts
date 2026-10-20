import "server-only";
import { getSettings } from "@/server/services/settings";
import { unstable_cache } from "next/cache";
import { db } from "@/server/db";
import { getPricing, type PricingPlan } from "@/server/services/catalog";
import { computePublicStats, getPublished, listPublished, type PublicEntry, type StoryData, type TeamData } from "@/server/services/cms";
import type { BillingInterval } from "@/generated/prisma/enums";

/**
 * Data for the public site. Pages are statically generated with ISR
 * (revalidate 3600) and re-rendered on demand when CMS content is saved.
 *
 * Market-specific content (prices, phone numbers, hero copy) is rendered for
 * every ACTIVE market and the right variant is shown by CSS from the `market`
 * cookie (see market.tsx). That keeps every marketing page static.
 */

export const DEFAULT_MARKET = "US";

export type MarketInfo = {
  code: string;
  name: string;
  currency: string;
  locale: string;
  phoneDisplay: string | null;
  whatsapp: string | null;
  /** "resume" | "CV" — the word students in this market use (from the market's resume style). */
  docWord: string;
};

export async function getActiveMarkets(): Promise<MarketInfo[]> {
  const rows = await db.market.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { code: true, name: true, currency: true, locale: true, phoneDisplay: true, whatsapp: true, resumeStyle: { select: { documentTitle: true } } },
  });
  const list = rows.map((m) => ({
    code: m.code,
    name: m.name,
    currency: m.currency,
    locale: m.locale,
    phoneDisplay: m.phoneDisplay,
    whatsapp: m.whatsapp,
    docWord: /^resume$/i.test(m.resumeStyle.documentTitle) ? "resume" : m.resumeStyle.documentTitle,
  }));
  // Default market first.
  return list.sort((a, b) => (a.code === DEFAULT_MARKET ? -1 : b.code === DEFAULT_MARKET ? 1 : 0));
}

export type MarketPricing = {
  market: MarketInfo;
  plans: PricingPlan[];
  intervals: BillingInterval[];
};

export async function getAllPricing(markets: MarketInfo[]): Promise<MarketPricing[]> {
  return Promise.all(
    markets.map(async (m) => {
      const p = await getPricing(m.code);
      // getPricing falls back to US for unknown codes — only keep exact matches.
      const ok = p.market?.code === m.code;
      return { market: m, plans: ok ? p.plans : [], intervals: ok ? p.intervals : [] };
    }),
  );
}

/**
 * One market's info + plans for a country homepage (D-141). Works for a
 * market that is not active yet (no plans → "being finalised" state) and
 * never falls back to another market's prices.
 */
export async function getMarketPricing(code: string): Promise<MarketPricing | null> {
  const m = await db.market.findUnique({
    where: { code },
    select: { code: true, name: true, currency: true, locale: true, phoneDisplay: true, whatsapp: true, isActive: true, resumeStyle: { select: { documentTitle: true } } },
  });
  if (!m) return null;
  const market: MarketInfo = {
    code: m.code,
    name: m.name,
    currency: m.currency,
    locale: m.locale,
    phoneDisplay: m.phoneDisplay,
    whatsapp: m.whatsapp,
    docWord: /^resume$/i.test(m.resumeStyle.documentTitle) ? "resume" : m.resumeStyle.documentTitle,
  };
  if (!m.isActive) return { market, plans: [], intervals: [] };
  const [p] = await getAllPricing([market]);
  return p ?? { market, plans: [], intervals: [] };
}

/** Placeholder market info when the Market row is missing (fresh DB): copy still renders, no plans. */
export function getMarketPricingFallback(code: string): MarketPricing {
  const known: Record<string, Pick<MarketInfo, "name" | "currency" | "locale" | "docWord">> = {
    US: { name: "United States", currency: "USD", locale: "en-US", docWord: "resume" },
    IN: { name: "India", currency: "INR", locale: "en-IN", docWord: "resume" },
    UK: { name: "United Kingdom", currency: "GBP", locale: "en-GB", docWord: "CV" },
  };
  const k = known[code] ?? known.US!;
  return { market: { code, ...k, phoneDisplay: null, whatsapp: null }, plans: [], intervals: [] };
}

/** True when at least one price in the market can be bought (placeholders are 0 and blocked by the floor). */
export function hasPurchasablePlan(pricing: MarketPricing | null | undefined) {
  return Boolean(pricing?.plans.some((p) => p.prices.some((x) => x.purchasable)));
}

/** Daily application targets offered in a market (for "25–50 jobs a day" copy). Falls back to the spec's 25–50. */
export function targetRange(pricing: MarketPricing | undefined) {
  const targets = (pricing?.plans ?? []).flatMap((p) => p.prices.map((x) => x.dailyTarget)).filter((n) => n > 0);
  if (!targets.length) return { min: 25, max: 50 };
  return { min: Math.min(...targets), max: Math.max(...targets) };
}

/** Public contact details + headline results from admin settings (D-142). */
export async function getPublicSite() {
  return (await getSettings()).publicSite;
}

/** Proof-strip counters: computed from the DB, cached for a day (SPEC §6.2). */
export const getPublicStats = unstable_cache(computePublicStats, ["public-stats-v1"], { revalidate: 86_400, tags: ["public-stats"] });

export type Story = PublicEntry & { story: StoryData };
export type TeamMember = PublicEntry & { member: TeamData };

function asStory(e: PublicEntry): Story | null {
  const f = (e.fields ?? {}) as Partial<StoryData>;
  if (!f.studentName || !f.role || !f.company || !f.quote) return null;
  return { ...e, story: f as StoryData };
}

export async function getStories(take?: number) {
  const rows = await listPublished("STORY", { take });
  return rows.map(asStory).filter((s): s is Story => s !== null);
}

export async function getStory(slug: string) {
  const e = await getPublished("STORY", slug);
  return e ? asStory(e) : null;
}

export async function getTeam(): Promise<TeamMember[]> {
  const rows = await listPublished("TEAM");
  return rows.flatMap((e) => {
    const f = (e.fields ?? {}) as Partial<TeamData>;
    return f.name && f.role ? [{ ...e, member: f as TeamData }] : [];
  });
}

/** Unique companies from published success stories (proof strip "hired at"). */
export function hiredAt(stories: Story[]) {
  const seen = new Map<string, { name: string; domain?: string }>();
  for (const s of stories) {
    const key = s.story.company.toLowerCase();
    if (!seen.has(key)) seen.set(key, { name: s.story.company, domain: s.story.companyDomain });
  }
  return [...seen.values()];
}

export async function getFaqs(take?: number) {
  return listPublished("FAQ", { take });
}

export async function getLandings() {
  return listPublished("LANDING");
}

/** Strip tags for JSON-LD / meta descriptions (input is our own sanitised HTML). */
export function htmlToText(html: string) {
  return html
    .replace(/<\/(p|h[1-6]|li|blockquote)>/g, "$&\n")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function formatPrice(amountMinor: number, currency: string, locale: string) {
  const digits = amountMinor % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amountMinor / 100);
}

export function formatCount(n: number, locale = "en-US") {
  return new Intl.NumberFormat(locale).format(n);
}

export function formatDay(d: Date | string, locale = "en-US") {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d));
}
