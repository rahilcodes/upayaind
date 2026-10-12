import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatDay, htmlToText } from "@/components/marketing/data";
import { pageMetadata } from "@/components/marketing/seo";
import { PageHero, Section } from "@/components/marketing/ui";
import { listPublished, mediaUrl, readingMinutes } from "@/server/services/cms";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.meta");
  return pageMetadata({ title: t("blogTitle"), description: t("blogDescription"), path: "/blog" });
}

export default async function BlogIndex() {
  const [t, posts] = await Promise.all([getTranslations("marketing.blog"), listPublished("BLOG", { order: "recent" })]);
  return (
    <>
      <PageHero eyebrow={t("eyebrow")} title={t("title")} sub={t("sub")} />
      <Section tone="white" label={t("title")} className="pt-12 sm:pt-16">
        {posts.length ? (
          <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((p, i) => {
              const text = htmlToText(p.bodyHtml);
              return (
                <li key={p.id}>
                  <article className="group relative flex h-full flex-col overflow-hidden rounded-[20px] border border-sand bg-paper transition-shadow focus-within:shadow-[0_0_0_3px_rgba(10,53,214,0.35)] hover:shadow-[0_20px_40px_-24px_rgba(11,24,70,0.35)]">
                    {p.ogImageKey ? (
                      <div className="relative aspect-[1200/630] bg-[#E3E6EF]">
                        <Image src={mediaUrl(p.ogImageKey)} alt="" fill sizes="(min-width: 1024px) 380px, (min-width: 768px) 45vw, 100vw" className="object-cover" priority={i < 3} />
                      </div>
                    ) : (
                      <div aria-hidden="true" className="brand-gradient h-1.5" />
                    )}
                    <div className="flex flex-1 flex-col gap-3 p-6">
                      <p className="text-[13px] text-[#5A6585]">
                        {p.publishedAt ? <time dateTime={p.publishedAt.toISOString()}>{formatDay(p.publishedAt)}</time> : null}
                        {p.publishedAt ? " · " : null}
                        {t("minutes", { n: readingMinutes(text) })}
                      </p>
                      <h2 className="text-xl font-bold leading-snug">
                        <Link href={`/blog/${p.slug}`} className="text-ink no-underline after:absolute after:inset-0 focus-visible:outline-none group-hover:text-royal">
                          {p.title}
                        </Link>
                      </h2>
                      <p className="line-clamp-3 text-[15px] text-[#3E4A6E]">{p.excerpt || text.slice(0, 220)}</p>
                      <span aria-hidden="true" className="mt-auto pt-2 font-semibold text-royal">
                        {t("read")} →
                      </span>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mx-auto max-w-[560px] rounded-[20px] border border-dashed border-[#D5DAE6] px-6 py-12 text-center text-[#3E4A6E]">{t("empty")}</p>
        )}
      </Section>
    </>
  );
}
