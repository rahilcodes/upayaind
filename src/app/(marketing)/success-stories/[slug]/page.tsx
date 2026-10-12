import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { env } from "@/env";
import { absoluteUrl } from "@/lib/utils";
import { formatCount, getStory } from "@/components/marketing/data";
import { JsonLd, ORG_ID, breadcrumbLd } from "@/components/marketing/json-ld";
import { FinalCta, StoryPhoto } from "@/components/marketing/sections";
import { pageMetadata } from "@/components/marketing/seo";
import { Breadcrumbs, Prose, container, h1Class } from "@/components/marketing/ui";
import { listPublished, videoEmbedUrl } from "@/server/services/cms";

export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  const rows = await listPublished("STORY");
  return rows.map((r) => ({ slug: r.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [t, s] = await Promise.all([getTranslations("marketing.meta"), getStory(slug)]);
  if (!s) return {};
  const vars = { name: s.story.studentName, role: s.story.role, company: s.story.company };
  return pageMetadata({
    title: s.seoTitle || t("storyTitle", vars),
    description: s.seoDescription || s.excerpt || t("storyDescription", vars),
    path: `/success-stories/${slug}`,
    canonical: s.canonicalUrl,
    noindex: s.noindex,
    ogImageId: s.ogImageKey,
    type: "article",
  });
}

export default async function StoryPage({ params }: Props) {
  const { slug } = await params;
  const [t, tn, s] = await Promise.all([getTranslations("marketing.stories"), getTranslations("marketing.nav"), getStory(slug)]);
  if (!s) notFound();
  const st = s.story;
  const video = videoEmbedUrl(st.videoUrl);
  const reviewLd = {
    "@context": "https://schema.org",
    "@type": "Review",
    name: s.title,
    url: absoluteUrl(`/success-stories/${s.slug}`),
    reviewBody: st.quote,
    author: { "@type": "Person", name: st.studentName },
    itemReviewed: { "@type": "Service", name: "UpayaInd done-for-you job applications", provider: { "@id": ORG_ID } },
    ...(s.publishedAt ? { datePublished: s.publishedAt.toISOString() } : {}),
  };

  return (
    <>
      <article>
        <header className="px-4 pb-12 pt-10 sm:px-6 sm:pt-14">
          <div className={container}>
            <Breadcrumbs label={tn("breadcrumb")} items={[{ href: "/success-stories", label: t("back") }, { label: st.studentName }]} />
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-end">
              <div>
                <div className="mb-6 flex items-center gap-4">
                  <StoryPhoto story={s} size={72} />
                  <p className="text-lg text-[#3E4A6E]">
                    <span className="block font-bold text-ink">{st.studentName}</span>
                    {t("roleAt", { role: st.role, company: st.company })}
                  </p>
                </div>
                <h1 className={h1Class}>“{st.quote}”</h1>
              </div>
              <dl className="grid grid-cols-2 gap-3">
                {st.weeksToOffer != null ? (
                  <div className="flex flex-col-reverse rounded-[16px] bg-ink p-5 text-white">
                    <dt className="text-sm text-[#B9C3E3]">{t("statWeeks")}</dt>
                    <dd className="font-display text-[36px] font-semibold leading-tight tabular">{st.weeksToOffer}</dd>
                  </div>
                ) : null}
                {st.applicationsSent != null ? (
                  <div className="flex flex-col-reverse rounded-[16px] bg-ink p-5 text-white">
                    <dt className="text-sm text-[#B9C3E3]">{t("statApps")}</dt>
                    <dd className="font-display text-[36px] font-semibold leading-tight tabular">{formatCount(st.applicationsSent)}</dd>
                  </div>
                ) : null}
                <div className="flex flex-col-reverse rounded-[16px] border border-sand bg-white p-5">
                  <dt className="text-sm text-[#5A6585]">{t("statCompany")}</dt>
                  <dd className="text-lg font-bold">{st.company}</dd>
                </div>
                <div className="flex flex-col-reverse rounded-[16px] border border-sand bg-white p-5">
                  <dt className="text-sm text-[#5A6585]">{t("statRole")}</dt>
                  <dd className="text-lg font-bold">{st.role}</dd>
                </div>
              </dl>
            </div>
          </div>
        </header>
        <div className="bg-white px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-[720px]">
            {video ? (
              <div className="mb-10 aspect-video overflow-hidden rounded-[18px] border border-sand bg-ink">
                <iframe
                  src={video}
                  title={t("video", { name: st.studentName })}
                  loading="lazy"
                  allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  referrerPolicy="strict-origin-when-cross-origin"
                  className="h-full w-full"
                />
              </div>
            ) : null}
            <Prose html={s.bodyHtml} />
          </div>
        </div>
      </article>
      <FinalCta calcom={Boolean(env.CALCOM_LINK)} />
      <JsonLd data={[reviewLd, breadcrumbLd([{ name: "Success stories", path: "/success-stories" }, { name: st.studentName, path: `/success-stories/${s.slug}` }])]} />
    </>
  );
}
