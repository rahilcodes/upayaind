import type { Metadata } from "next";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { env } from "@/env";
import { whatsappHref } from "@/components/marketing/chrome";
import { getActiveMarkets, getPublicSite } from "@/components/marketing/data";
import { ImageSlot } from "@/components/marketing/image-slot";
import { imageSlot } from "@/components/marketing/images";
import { PerMarket } from "@/components/marketing/market";
import { SocialLinks } from "@/components/marketing/social-links";
import { pageMetadata } from "@/components/marketing/seo";
import { trackAttrs } from "@/components/marketing/track";
import { PageHero, RisingArrow, container } from "@/components/marketing/ui";
import { getPublished } from "@/server/services/cms";
import { DIAL_CODES } from "@/server/services/leads";
import { listSignupMarkets } from "@/server/services/catalog";
import { CalEmbed } from "./cal-embed";
import { ContactForm } from "./contact-form";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.meta");
  return pageMetadata({ title: t("contactTitle"), description: t("contactDescription"), path: "/contact" });
}

export default async function ContactPage() {
  const [t, markets, signupMarkets, privacy, site] = await Promise.all([getTranslations("marketing.contact"), getActiveMarkets(), listSignupMarkets(), getPublished("LEGAL", "privacy"), getPublicSite()]);
  const keys = ["name", "email", "phone", "phoneHint", "phoneCountry", "market", "message", "messageHint", "send", "sending", "sentTitle", "sentBody", "sendAnother", "honeypot"] as const;
  const copy = Object.fromEntries(keys.map((k) => [k, t(k)])) as Record<(typeof keys)[number], string>;
  const consent = privacy
    ? t.rich("consent", {
        privacy: (c) => (
          <Link href="/legal/privacy" target="_blank" className="font-semibold text-royal underline underline-offset-2">
            {c}
          </Link>
        ),
      })
    : t("consentNoLink");
  const formMarkets = signupMarkets.length ? signupMarkets : markets.map((m) => ({ code: m.code, name: m.name }));
  const dialCodes = Object.entries(DIAL_CODES).map(([code, d]) => ({ code, label: `${code} ${d.dial}` }));
  const withContact = markets.filter((m) => m.whatsapp || m.phoneDisplay);
  // Offices in market order (visitor's market first via PerMarket ordering is not needed: all are listed).
  const offices = Object.entries(site.offices)
    .filter(([, address]) => address.trim())
    .map(([code, address]) => ({ code, address, name: markets.find((m) => m.code === code)?.name ?? code }));

  return (
    <>
      <PageHero eyebrow={t("eyebrow")} title={t("title")} sub={t("sub")} />
      <section aria-label={t("formTitle")} className="px-4 pb-20 sm:px-6">
        <div className={cn(container, "grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]")}>
          <div className="rounded-[22px] border border-sand bg-white p-6 sm:p-9">
            <h2 className="mb-1 text-2xl font-bold">{t("formTitle")}</h2>
            <p className="mb-7 text-[15px] text-[#4A5578]">{t("replyTime")}</p>
            <ContactForm copy={copy} consent={consent} markets={formMarkets} dialCodes={dialCodes} />
          </div>
          <div className="flex flex-col gap-6">
            <div id="book" className="relative scroll-mt-6 overflow-hidden rounded-[22px] brand-deep p-6 text-white sm:p-8">
              <RisingArrow className="pointer-events-none absolute -bottom-8 -right-10 w-[260px] opacity-30" />
              <h2 className="relative mb-2 text-2xl font-bold">{t("bookTitle")}</h2>
              {env.CALCOM_LINK ? (
                <>
                  <p className="relative mb-6 text-[#EEF4FF]">{t("bookSub")}</p>
                  <div className="relative">
                    <CalEmbed link={env.CALCOM_LINK} label={t("bookButton")} title={t("bookFrameTitle")} />
                  </div>
                </>
              ) : (
                <p className="relative text-[#EEF4FF]">{t("bookUnavailable")}</p>
              )}
            </div>
            {site.contactEmail ? (
              <div className="rounded-[22px] border border-sand bg-white p-6 sm:p-8">
                <h2 className="mb-2 text-xl font-bold">{t("emailTitle")}</h2>
                <a href={`mailto:${site.contactEmail}`} className="inline-flex min-h-11 items-center break-all text-lg font-semibold text-royal hover:underline">
                  {site.contactEmail}
                </a>
                <p className="text-sm text-[#5A6585]">{t("replyTime")}</p>
              </div>
            ) : null}
            {withContact.length ? (
              <PerMarket items={withContact}>
                {(m) => (
                  <div className="flex flex-col gap-6">
                    {m.whatsapp ? (
                      <div className="rounded-[22px] border border-sand bg-white p-6 sm:p-8">
                        <h2 className="mb-2 text-xl font-bold">{t("whatsappTitle")}</h2>
                        <p className="mb-5 text-[#3E4A6E]">{t("whatsappSub")}</p>
                        <a
                          href={whatsappHref(m.whatsapp, t("whatsappText"))}
                          target="_blank"
                          rel="noopener noreferrer"
                          {...trackAttrs("cta_book_call", { location: "whatsapp", market: m.code })}
                          className="inline-flex min-h-[52px] items-center gap-2.5 rounded-[12px] bg-[#1E7B4F] px-6 font-semibold text-white hover:bg-[#17633f]"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.48.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.04 21.5h-.01a9.43 9.43 0 0 1-4.8-1.32l-.35-.2-3.57.94.95-3.48-.22-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.24-9.43 9.45-9.43 2.52 0 4.89.98 6.67 2.77a9.37 9.37 0 0 1 2.76 6.67c0 5.2-4.24 9.43-9.44 9.43zm8.03-17.46A11.27 11.27 0 0 0 12.04.72C5.79.72.7 5.8.7 12.05c0 2 .52 3.95 1.52 5.66L.6 23.6l6.03-1.58a11.33 11.33 0 0 0 5.41 1.38h.01c6.25 0 11.34-5.08 11.34-11.33 0-3.03-1.18-5.87-3.32-8.02z" />
                          </svg>
                          {t("whatsappButton")}
                        </a>
                      </div>
                    ) : null}
                    {m.phoneDisplay ? (
                      <div className="rounded-[22px] border border-sand bg-white p-6 sm:p-8">
                        <h2 className="mb-2 text-xl font-bold">{t("callTitle")}</h2>
                        <a href={`tel:${m.phoneDisplay.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-11 items-center text-lg font-semibold text-royal tabular hover:underline">
                          {m.phoneDisplay}
                        </a>
                        <p className="text-sm text-[#5A6585]">{m.name}</p>
                      </div>
                    ) : null}
                  </div>
                )}
              </PerMarket>
            ) : null}
            {offices.length ? (
              <div className="rounded-[22px] border border-sand bg-white p-6 sm:p-8">
                <h2 className="mb-4 text-xl font-bold">{t("officesTitle")}</h2>
                <dl className="grid gap-5">
                  {offices.map((o) => (
                    <div key={o.code}>
                      <dt className="text-[13px] font-semibold uppercase tracking-wide text-[#5A6585]">{o.name}</dt>
                      <dd><address className="text-[15px] not-italic text-[#3E4A6E]">{o.address}</address></dd>
                      {imageSlot(`contact-office-${o.code.toLowerCase()}`) ? <ImageSlot id={`contact-office-${o.code.toLowerCase()}`} className="mt-3 aspect-[16/10]" rounded="rounded-[14px]" sizes="(min-width: 1024px) 420px, 100vw" /> : null}
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
            <div className="rounded-[22px] border border-sand bg-white p-6 sm:p-8">
              <h2 className="mb-2 text-xl font-bold">{t("followTitle")}</h2>
              <SocialLinks links={site.social} className="-ml-3" size={24} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
