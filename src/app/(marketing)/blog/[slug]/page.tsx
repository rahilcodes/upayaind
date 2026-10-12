import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { env } from "@/env";
import { absoluteUrl, cn } from "@/lib/utils";
import { formatDay, htmlToText } from "@/components/marketing/data";
import { JsonLd, ORG_ID, breadcrumbLd } from "@/components/marketing/json-ld";
import { FinalCta } from "@/components/marketing/sections";
import { pageMetadata } from "@/components/marketing/seo";
import { Breadcrumbs, Prose, container, h1Class } from "@/components/marketing/ui";
import { getPublished, listPublished, mediaUrl, readingMinutes } from "@/server/services/cms";

export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  const rows = await listPublished("BLOG");
  return rows.map((r) => ({ slug: r.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const e = await getPublished("BLOG", slug);
  if (!e) return {};
  return pageMetadata({
    title: e.seoTitle || e.title,
    description: e.seoDescription || e.excerpt || htmlToText(e.bodyHtml),
    path: `/blog/${slug}`,
    canonical: e.canonicalUrl,
    noindex: e.noindex,
    ogImageId: e.ogImageKey,
    type: "article",
    publishedTime: e.publishedAt?.toISOString(),
    modifiedTime: e.updatedAt.toISOString(),
  });
}

/** Unknown or unpublished slugs redirect to /blog (SPEC §18, DECISIONS D-012). */
export default async function BlogPost({ params }: Props) {
  const { slug } = await params;
  const [t, tn, e] = await Promise.all([getTranslations("marketing.blog"), getTranslations("marketing.nav"), getPublished("BLOG", slug)]);
  if (!e) redirect("/blog");
  const text = htmlToText(e.bodyHtml);
  const url = absoluteUrl(`/blog/${e.slug}`);
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: e.title.slice(0, 110),
    description: e.seoDescription || e.excerpt || text.slice(0, 155),
    mainEntityOfPage: url,
    url,
    image: e.ogImageKey ? [absoluteUrl(mediaUrl(e.ogImageKey))] : [absoluteUrl(`/blog/${e.slug}/opengraph-image`)],
    datePublished: (e.publishedAt ?? e.updatedAt).toISOString(),
    dateModified: e.updatedAt.toISOString(),
    author: { "@type": "Organization", name: "UpayaInd", "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    wordCount: text.split(/\s+/).filter(Boolean).length,
  };
  return (
    <>
      <article className="px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
        <div className={cn(container, "max-w-[760px]")}>
          <Breadcrumbs label={tn("breadcrumb")} items={[{ href: "/blog", label: t("back") }, { label: e.title }]} />
          <h1 className={cn(h1Class, "mb-5 text-[36px] sm:text-[46px] lg:text-[52px]")}>{e.title}</h1>
          {e.excerpt ? <p className="mb-5 text-lg text-[#3E4A6E] sm:text-xl">{e.excerpt}</p> : null}
          <p className="mb-10 border-b border-sand pb-6 text-sm text-[#5A6585]">
            {e.publishedAt ? <time dateTime={e.publishedAt.toISOString()}>{t("published", { date: formatDay(e.publishedAt) })}</time> : null}
            {e.publishedAt ? " · " : null}
            {t("minutes", { n: readingMinutes(text) })}
          </p>
          <Prose html={e.bodyHtml} />
        </div>
      </article>
      <FinalCta calcom={Boolean(env.CALCOM_LINK)} />
      <JsonLd data={[articleLd, breadcrumbLd([{ name: "Blog", path: "/blog" }, { name: e.title, path: `/blog/${e.slug}` }])]} />
    </>
  );
}
