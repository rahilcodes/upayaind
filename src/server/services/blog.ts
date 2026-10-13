/**
 * Blog helpers (DECISIONS D-134): reading time, related posts, RSS 2.0 and
 * Atom feeds. Pure functions over `PublicEntry` so they're unit-tested without
 * a database; the routes under /blog call them.
 */
import type { PublicEntry } from "./cms";

export const WORDS_PER_MINUTE = 200;

export function wordCount(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Minutes to read at 200 wpm, never below 1. */
export function readingTime(text: string) {
  return Math.max(1, Math.round(wordCount(text) / WORDS_PER_MINUTE));
}

/** Tags from `CmsEntry.data.tags` (array of strings or a comma-separated string), normalised. */
export function postTags(fields: Record<string, unknown> | null | undefined): string[] {
  const raw = fields?.tags;
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const out = new Set<string>();
  for (const t of list) if (typeof t === "string" && t.trim()) out.add(t.trim().toLowerCase());
  return [...out];
}

type Postish = Pick<PublicEntry, "id" | "slug" | "fields" | "publishedAt" | "updatedAt">;

/**
 * Related posts: the ones sharing the most tags (ties → most recent); when the
 * post has no tags (or nothing shares one) fall back to the latest `n` posts.
 */
export function relatedPosts<T extends Postish>(current: Pick<T, "id" | "fields">, all: T[], n = 3): T[] {
  const others = all.filter((p) => p.id !== current.id);
  const byDate = (a: T, b: T) => (b.publishedAt ?? b.updatedAt).getTime() - (a.publishedAt ?? a.updatedAt).getTime();
  const mine = new Set(postTags(current.fields));
  if (mine.size) {
    const scored = others
      .map((p) => ({ p, score: postTags(p.fields).filter((t) => mine.has(t)).length }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || byDate(a.p, b.p));
    if (scored.length) {
      const picked = scored.slice(0, n).map((x) => x.p);
      if (picked.length < n) {
        const ids = new Set(picked.map((p) => p.id));
        picked.push(...others.filter((p) => !ids.has(p.id)).sort(byDate).slice(0, n - picked.length));
      }
      return picked;
    }
  }
  return [...others].sort(byDate).slice(0, n);
}

// ───────────────────────────── Feeds ─────────────────────────────

export function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

export type FeedPost = {
  slug: string;
  title: string;
  summary: string;
  /** Sanitised HTML body (server-generated, see cms.ts). */
  html?: string;
  publishedAt: Date;
  updatedAt: Date;
  tags?: string[];
  image?: string;
};

export type FeedOptions = {
  siteUrl: string;
  title: string;
  description: string;
  /** Path of the feed itself (for <atom:link rel="self">). */
  feedPath: string;
  language?: string;
  author?: string;
  /** Include full HTML bodies (`content:encoded` / `<content>`), default true. */
  fullContent?: boolean;
};

const postUrl = (siteUrl: string, slug: string) => `${siteUrl.replace(/\/$/, "")}/blog/${slug}`;

export function buildRss(posts: FeedPost[], o: FeedOptions) {
  const site = o.siteUrl.replace(/\/$/, "");
  const latest = posts.reduce<Date | null>((m, p) => (!m || p.updatedAt > m ? p.updatedAt : m), null) ?? new Date();
  const items = posts
    .map((p) => {
      const url = postUrl(site, p.slug);
      return [
        "    <item>",
        `      <title>${escapeXml(p.title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <pubDate>${p.publishedAt.toUTCString()}</pubDate>`,
        `      <description>${escapeXml(p.summary)}</description>`,
        ...(p.tags ?? []).map((t) => `      <category>${escapeXml(t)}</category>`),
        ...(p.image ? [`      <enclosure url="${escapeXml(p.image)}" type="image/png" length="0" />`] : []),
        ...(o.fullContent !== false && p.html ? [`      <content:encoded><![CDATA[${p.html.replace(/]]>/g, "]]]]><![CDATA[>")}]]></content:encoded>`] : []),
        "    </item>",
      ].join("\n");
    })
    .join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    "  <channel>",
    `    <title>${escapeXml(o.title)}</title>`,
    `    <link>${escapeXml(`${site}/blog`)}</link>`,
    `    <description>${escapeXml(o.description)}</description>`,
    `    <language>${o.language ?? "en"}</language>`,
    `    <lastBuildDate>${latest.toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(`${site}${o.feedPath}`)}" rel="self" type="application/rss+xml" />`,
    `    <generator>UpayaInd</generator>`,
    items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

export function buildAtom(posts: FeedPost[], o: FeedOptions) {
  const site = o.siteUrl.replace(/\/$/, "");
  const latest = posts.reduce<Date | null>((m, p) => (!m || p.updatedAt > m ? p.updatedAt : m), null) ?? new Date();
  const entries = posts
    .map((p) => {
      const url = postUrl(site, p.slug);
      return [
        "  <entry>",
        `    <title>${escapeXml(p.title)}</title>`,
        `    <link rel="alternate" type="text/html" href="${escapeXml(url)}" />`,
        `    <id>${escapeXml(url)}</id>`,
        `    <published>${p.publishedAt.toISOString()}</published>`,
        `    <updated>${p.updatedAt.toISOString()}</updated>`,
        `    <summary>${escapeXml(p.summary)}</summary>`,
        ...(p.tags ?? []).map((t) => `    <category term="${escapeXml(t)}" />`),
        ...(o.fullContent !== false && p.html ? [`    <content type="html">${escapeXml(p.html)}</content>`] : []),
        "  </entry>",
      ].join("\n");
    })
    .join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <title>${escapeXml(o.title)}</title>`,
    `  <subtitle>${escapeXml(o.description)}</subtitle>`,
    `  <link rel="alternate" type="text/html" href="${escapeXml(`${site}/blog`)}" />`,
    `  <link rel="self" type="application/atom+xml" href="${escapeXml(`${site}${o.feedPath}`)}" />`,
    `  <id>${escapeXml(`${site}/blog`)}</id>`,
    `  <updated>${latest.toISOString()}</updated>`,
    `  <author><name>${escapeXml(o.author ?? "UpayaInd")}</name></author>`,
    entries,
    "</feed>",
    "",
  ].join("\n");
}

/** Shape a published CMS entry for the feeds. */
export function toFeedPost(e: PublicEntry, opts: { text: string; image?: string }): FeedPost {
  return {
    slug: e.slug,
    title: e.title,
    summary: e.seoDescription || e.excerpt || opts.text.slice(0, 200),
    html: e.bodyHtml,
    publishedAt: e.publishedAt ?? e.updatedAt,
    updatedAt: e.updatedAt,
    tags: postTags(e.fields),
    image: opts.image,
  };
}
