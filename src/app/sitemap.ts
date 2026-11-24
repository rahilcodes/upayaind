import type { MetadataRoute } from "next";
import { COUNTRY_SEGMENTS, countryAlternates, homeAlternates } from "@/lib/market";
import { absoluteUrl } from "@/lib/utils";
import { sitemapEntries } from "@/server/services/cms";

/** SPEC §6.1: static marketing pages + every published, indexable CMS page. Revalidated on CMS save. */
export const revalidate = 3600;

type Entry = { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; alternates?: Record<string, string> };

const abs = (map: Record<string, string>) => Object.fromEntries(Object.entries(map).map(([lang, path]) => [lang, absoluteUrl(path)]));
const segments = Object.values(COUNTRY_SEGMENTS);

/** Country homepages and country pricing pages list their hreflang set here too (D-172). */
const STATIC: Entry[] = [
  { path: "/", priority: 1, changeFrequency: "weekly", alternates: homeAlternates() },
  ...segments.map((s): Entry => ({ path: `/${s}`, priority: 1, changeFrequency: "weekly", alternates: homeAlternates() })),
  { path: "/pricing", priority: 0.9, changeFrequency: "weekly", alternates: countryAlternates("/pricing") },
  ...segments.map((s): Entry => ({ path: `/${s}/pricing`, priority: 0.9, changeFrequency: "weekly", alternates: countryAlternates("/pricing") })),
  { path: "/how-it-works", priority: 0.9, changeFrequency: "monthly" },
  { path: "/success-stories", priority: 0.7, changeFrequency: "weekly" },
  { path: "/about", priority: 0.6, changeFrequency: "monthly" },
  { path: "/blog", priority: 0.6, changeFrequency: "weekly" },
  { path: "/faq", priority: 0.6, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.5, changeFrequency: "yearly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let cms: Awaited<ReturnType<typeof sitemapEntries>> = [];
  try {
    cms = await sitemapEntries();
  } catch (e) {
    console.error("[sitemap] CMS unavailable", e);
  }
  return [
    ...STATIC.map((s) => ({
      url: absoluteUrl(s.path),
      changeFrequency: s.changeFrequency,
      priority: s.priority,
      ...(s.alternates ? { alternates: { languages: abs(s.alternates) } } : {}),
    })),
    ...cms
      .filter((c) => !STATIC.some((s) => s.path === c.path))
      .map((c) => ({
        url: absoluteUrl(c.path),
        lastModified: c.updatedAt,
        changeFrequency: (c.kind === "LEGAL" ? "yearly" : "monthly") as MetadataRoute.Sitemap[number]["changeFrequency"],
        priority: c.kind === "LANDING" ? 0.8 : c.kind === "LEGAL" ? 0.3 : 0.6,
      })),
  ];
}
