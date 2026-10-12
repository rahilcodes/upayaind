import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { env } from "@/env";
import { getStories } from "@/components/marketing/data";
import { FinalCta, StoryCard } from "@/components/marketing/sections";
import { pageMetadata } from "@/components/marketing/seo";
import { PageHero, Section } from "@/components/marketing/ui";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.meta");
  return pageMetadata({ title: t("storiesTitle"), description: t("storiesDescription"), path: "/success-stories" });
}

export default async function StoriesPage() {
  const [t, stories] = await Promise.all([getTranslations("marketing.stories"), getStories()]);
  return (
    <>
      <PageHero eyebrow={t("title")} title={t("pageTitle")} sub={t("pageSub")} />
      <Section tone="white" label={t("pageTitle")} className="pt-12 sm:pt-16">
        {stories.length ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {stories.map((s) => (
              <StoryCard key={s.id} story={s} headingLevel={2} />
            ))}
          </div>
        ) : (
          <p className="mx-auto max-w-[560px] rounded-[20px] border border-dashed border-[#D5DAE6] px-6 py-12 text-center text-[#3E4A6E]">{t("empty")}</p>
        )}
      </Section>
      <FinalCta calcom={Boolean(env.CALCOM_LINK)} />
    </>
  );
}
