import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { env } from "@/env";
import { getTeam } from "@/components/marketing/data";
import { TeamGallery } from "@/components/marketing/extras";
import { ImageSlot } from "@/components/marketing/image-slot";
import { FinalCta } from "@/components/marketing/sections";
import { pageMetadata } from "@/components/marketing/seo";
import { Eyebrow, H2, PageHero, Prose, Section } from "@/components/marketing/ui";
import { getPublished, mediaUrl } from "@/server/services/cms";

export const revalidate = 3600;

/** The founder note is the published PAGE entry with slug "about" (CMS). */
export async function generateMetadata(): Promise<Metadata> {
  const [t, page] = await Promise.all([getTranslations("marketing.meta"), getPublished("PAGE", "about")]);
  return pageMetadata({
    title: page?.seoTitle || t("aboutTitle"),
    description: page?.seoDescription || t("aboutDescription"),
    path: "/about",
    canonical: page?.canonicalUrl,
    noindex: page?.noindex,
    ogImageId: page?.ogImageKey,
  });
}

export default async function AboutPage() {
  const [t, team, page] = await Promise.all([getTranslations("marketing.about"), getTeam(), getPublished("PAGE", "about")]);
  const values = t.raw("values") as { title: string; body: string }[];
  return (
    <>
      <PageHero eyebrow={t("eyebrow")} title={t("title")} sub={t("sub")}>
        <ImageSlot id="about-hero" priority className="mt-10 aspect-[12/7] max-h-[520px]" sizes="(min-width: 1200px) 1200px, 100vw" />
      </PageHero>

      <Section tone="white" labelledBy="mission-title" inner="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div>
          <Eyebrow>{t("missionTitle")}</Eyebrow>
          <H2 id="mission-title" className="text-[30px] sm:text-[34px] lg:text-[40px]">
            {t("mission")}
          </H2>
        </div>
        <div>
          <h3 className="mb-5 text-lg font-bold">{t("valuesTitle")}</h3>
          <ul className="flex flex-col gap-4">
            {values.map((v) => (
              <li key={v.title} className="rounded-[18px] border border-sand bg-paper p-6">
                <p className="mb-1.5 font-bold">{v.title}</p>
                <p className="text-[#3E4A6E]">{v.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {page && page.bodyHtml.replace(/<[^>]+>/g, "").trim() ? (
        <Section labelledBy="founder-title" inner="max-w-[760px]">
          <H2 id="founder-title" className="mb-8">
            {page.title && page.title.toLowerCase() !== "about" ? page.title : t("founderTitle")}
          </H2>
          <Prose html={page.bodyHtml} />
        </Section>
      ) : null}

      {team.length ? (
        <Section tone="white" labelledBy="team-title">
          <H2 id="team-title" className="mb-3">
            {t("teamTitle")}
          </H2>
          <p className="mb-10 text-lg text-[#3E4A6E]">{t("teamSub")}</p>
          <ul className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
            {team.map((m) => (
              <li key={m.id} className="flex flex-col rounded-[18px] border border-sand bg-paper p-4 sm:p-5">
                <div className="relative mb-4 aspect-square overflow-hidden rounded-[14px] bg-[#E3E6EF]">
                  {m.member.photoId ? (
                    <Image src={mediaUrl(m.member.photoId)} alt={m.member.photoAlt || m.member.name} fill sizes="(min-width: 1024px) 260px, (min-width: 768px) 30vw, 45vw" className="object-cover" />
                  ) : (
                    <span aria-hidden="true" className="flex h-full w-full items-center justify-center font-display text-4xl font-semibold text-[#5A6585]">
                      {m.member.name
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join("")}
                    </span>
                  )}
                </div>
                <p className="font-bold">{m.member.name}</p>
                <p className="text-sm text-[#3E4A6E]">{m.member.role}</p>
                {m.member.linkedin ? (
                  <a href={m.member.linkedin} target="_blank" rel="noopener noreferrer" className="mt-auto inline-flex min-h-11 items-center gap-1.5 pt-2 text-sm font-semibold text-royal hover:underline">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.61 0 4.28 2.38 4.28 5.47v6.27zM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
                    </svg>
                    <span>LinkedIn</span>
                    <span className="sr-only"> — {t("linkedin", { name: m.member.name })}</span>
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <TeamGallery tone={team.length ? "paper" : "white"} title={t("galleryTitle")} />

      <FinalCta calcom={Boolean(env.CALCOM_LINK)} />
    </>
  );
}
