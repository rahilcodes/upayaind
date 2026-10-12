import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { env } from "@/env";
import { getFaqs, htmlToText } from "@/components/marketing/data";
import { JsonLd, faqLd } from "@/components/marketing/json-ld";
import { FaqList, FinalCta, faqItems } from "@/components/marketing/sections";
import { pageMetadata } from "@/components/marketing/seo";
import { PageHero, Section } from "@/components/marketing/ui";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.meta");
  return pageMetadata({ title: t("faqTitle"), description: t("faqDescription"), path: "/faq" });
}

export default async function FaqPage() {
  const [t, faqs] = await Promise.all([getTranslations("marketing.faq"), getFaqs()]);
  return (
    <>
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("pageTitle")}
        sub={
          <>
            {t("pageSub")}{" "}
            <Link href="/contact" className="font-semibold text-royal underline underline-offset-4 hover:text-ink">
              {t("askUs")}
            </Link>
            .
          </>
        }
      />
      <Section tone="white" label={t("pageTitle")} inner="max-w-[820px]" className="pt-8 sm:pt-10">
        <FaqList items={faqItems(faqs)} />
      </Section>
      <FinalCta calcom={Boolean(env.CALCOM_LINK)} />
      {faqs.length ? <JsonLd data={faqLd(faqs.map((f) => ({ q: f.title, a: htmlToText(f.bodyHtml) || f.excerpt || "" })))} /> : null}
    </>
  );
}
