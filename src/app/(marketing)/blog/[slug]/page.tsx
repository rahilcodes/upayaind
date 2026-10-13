import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { env } from "@/env";
import { absoluteUrl, cn } from "@/lib/utils";
import { formatDay, htmlToText } from "@/components/marketing/data";
import { JsonLd, ORG_ID, breadcrumbLd } from "@/components/marketing/json-ld";
import { FinalCta } from "@/components/marketing/sections";
import { pageMetadata } from "@/components/marketing/seo";
import { ShareButtons } from "@/components/marketing/share-buttons";
import { Breadcrumbs, Prose, container, h1Class } from "@/components/marketing/ui";
import { getPublished, listPublished, mediaUrl } from "@/server/services/cms";
import { postTags, readingTime, relatedPosts } from "@/server/services/blog";

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
  const related = relatedPosts(e, await listPublished("BLOG", { order: "recent" }), 3);
  const tags = postTags(e.fields);
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
    ...(tags.length ? { keywords: tags.join(", ") } : {}),
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
            {t("minutes", { n: readingTime(text) })}
          </p>
          <Prose html={e.bodyHtml} />
          {tags.length ? (
            <ul className="mt-10 flex flex-wrap gap-2" aria-label="Tags">
              {tags.map((tag) => (
                <li key={tag} className="rounded-full bg-[#EAF1FE] px-3 py-1 text-[13px] font-semibold text-royal">
                  #{tag}
                </li>
              ))}
            </ul>
          ) : null}
          <ShareButtons url={url} title={e.title} className="mt-8 border-t border-sand pt-6" />
        </div>
      </article>
      {related.length ? (
        <section aria-labelledby="related-heading" className="border-t border-sand bg-white px-4 py-14 sm:px-6">
          <div className={cn(container, "max-w-[1000px]")}>
            <h2 id="related-heading" className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[32px]">
              {t("related")}
            </h2>
            <p className="mt-1 text-[#3E4A6E]">{t("relatedSub")}</p>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((p) => {
                const ptext = htmlToText(p.bodyHtml);
                return (
                  <li key={p.id} className="group relative flex flex-col gap-2 rounded-[20px] border border-sand bg-paper p-5 transition-shadow hover:shadow-[0_20px_40px_-24px_rgba(11,24,70,0.35)]">
                    <p className="text-[13px] text-[#5A6585]">
                      {p.publishedAt ? <time dateTime={p.publishedAt.toISOString()}>{formatDay(p.publishedAt)}</time> : null}
                      {p.publishedAt ? " · " : null}
                      {t("minutes", { n: readingTime(ptext) })}
                    </p>
                    <h3 className="text-lg font-bold leading-snug">
                      <Link href={`/blog/${p.slug}`} className="text-ink no-underline after:absolute after:inset-0 focus-visible:outline-none group-hover:text-royal">
                        {p.title}
                      </Link>
                    </h3>
                    <p className="line-clamp-2 text-[15px] text-[#3E4A6E]">{p.excerpt || ptext.slice(0, 160)}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ) : null}
      <FinalCta calcom={Boolean(env.CALCOM_LINK)} />
      <JsonLd data={[articleLd, breadcrumbLd([{ name: "Blog", path: "/blog" }, { name: e.title, path: `/blog/${e.slug}` }])]} />
    </>
  );
}
