import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/utils";
import { mediaUrl } from "@/server/services/cms";

/**
 * Per-page metadata (SPEC §6.1): unique title ≤ 60 chars, description ≤ 155,
 * canonical, Open Graph + Twitter. OG images come from opengraph-image.tsx
 * files unless a CMS entry sets its own image.
 */
export function clip(s: string, max: number) {
  const v = s.replace(/\s+/g, " ").trim();
  if (v.length <= max) return v;
  const cut = v.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–—-]+$/, "")}…`;
}

export function pageMetadata(opts: {
  title: string;
  description: string;
  path: string;
  canonical?: string | null;
  noindex?: boolean;
  ogImageId?: string | null;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  /** Skip the "· UpayaInd" template (homepage). */
  absoluteTitle?: boolean;
}): Metadata {
  const suffix = " · UpayaInd";
  const hasBrand = /upayaind/i.test(opts.title);
  const absoluteTitle = opts.absoluteTitle || hasBrand;
  const title = clip(opts.title, absoluteTitle ? 60 : 60 - suffix.length);
  const fullTitle = absoluteTitle ? title : `${title}${suffix}`;
  const description = clip(opts.description, 155);
  const canonical = opts.canonical ? (opts.canonical.startsWith("/") ? absoluteUrl(opts.canonical) : opts.canonical) : absoluteUrl(opts.path);
  const images = opts.ogImageId ? [{ url: absoluteUrl(mediaUrl(opts.ogImageId)), alt: title }] : undefined;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical },
    robots: opts.noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      type: opts.type ?? "website",
      siteName: "UpayaInd",
      locale: "en_US",
      url: canonical,
      title: fullTitle,
      description,
      ...(images ? { images } : {}),
      ...(opts.publishedTime ? { publishedTime: opts.publishedTime } : {}),
      ...(opts.modifiedTime ? { modifiedTime: opts.modifiedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      ...(images ? { images } : {}),
    },
  };
}
