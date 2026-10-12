import type { Metadata } from "next";
import { cn } from "@/lib/utils";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { formatDay } from "@/components/marketing/data";
import { pageMetadata } from "@/components/marketing/seo";
import { Eyebrow, Prose, container, h1Class } from "@/components/marketing/ui";
import { LEGAL_SLUGS, getPublished } from "@/server/services/cms";

export const revalidate = 3600;
export const dynamicParams = true;

export function generateStaticParams() {
  return LEGAL_SLUGS.map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [t, e] = await Promise.all([getTranslations("marketing.meta"), getPublished("LEGAL", slug)]);
  if (!e) return { robots: { index: false } };
  return pageMetadata({
    title: e.seoTitle || e.title,
    description: e.seoDescription || e.excerpt || t("legalDescription", { title: e.title }),
    path: `/legal/${slug}`,
    canonical: e.canonicalUrl,
    noindex: e.noindex,
    ogImageId: e.ogImageKey,
  });
}

/** Legal pages come from the CMS; unpublished → 404 (SPEC §6.4). */
export default async function LegalPage({ params }: Props) {
  const { slug } = await params;
  if (!(LEGAL_SLUGS as readonly string[]).includes(slug)) notFound();
  const [t, e] = await Promise.all([getTranslations("marketing.legal"), getPublished("LEGAL", slug)]);
  if (!e) notFound();
  return (
    <article className="px-4 pb-20 pt-12 sm:px-6 sm:pt-16">
      <div className={cn(container, "max-w-[760px]")}>
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <h1 className={cn(h1Class, "mb-4")}>{e.title}</h1>
        <p className="mb-10 text-sm text-[#5A6585]">{t("updated", { date: formatDay(e.updatedAt) })}</p>
        <Prose html={e.bodyHtml} className="rounded-[20px] border border-sand bg-white p-6 sm:p-10" />
      </div>
    </article>
  );
}
