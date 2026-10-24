import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { HomeMarket } from "@/lib/market";
import { cn } from "@/lib/utils";
import { ImageSlot } from "./image-slot";
import { imageSlot } from "./images";
import { trackAttrs } from "./track";
import { ArrowRight, Check, Eyebrow, H2, Section, TextLink, cta } from "./ui";

/**
 * Client-requested homepage additions (D-148): testimonials, the "Life at
 * UpayaInd" photo gallery and the "Looking for a job?" promo banner.
 *
 * NOTE: the testimonials in marketing.json (`testimonials.items`) are SAMPLE
 * testimonials (`placeholder: true`) written as a stand-in until the client
 * provides real reviews with permission. Replace them before launch — in the
 * US (FTC) and UK (CMA/ASA) fabricated consumer reviews are unlawful.
 */

export type Testimonial = { name: string; role: string; location: string; rating: number; quote: string; photo?: string; placeholder?: boolean };

function Stars({ n, label }: { n: number; label: string }) {
  return (
    <span role="img" aria-label={label} className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill={i <= n ? "#F5A524" : "#D9DEEA"} aria-hidden="true" focusable="false">
          <path d="M12 2.5l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.3l-6 3.3 1.3-6.6L2.4 9.4l6.7-.8z" />
        </svg>
      ))}
    </span>
  );
}

function Initials({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span aria-hidden="true" className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-[#E3E6EF] text-[15px] font-bold text-[#3E4A6E]">
      {initials}
    </span>
  );
}

export async function Testimonials({ market, tone = "white" }: { market: HomeMarket; tone?: "paper" | "white" }) {
  const t = await getTranslations("marketing.testimonials");
  const items = t.raw(`items.${market}`) as Testimonial[];
  if (!items?.length) return null;
  return (
    <Section tone={tone} labelledBy="testimonials-title">
      <div className="mb-12 text-center">
        <Eyebrow className="text-center">{t("eyebrow")}</Eyebrow>
        <H2 id="testimonials-title" className="mb-3">
          {t("title")}
        </H2>
        <p className="mx-auto max-w-[560px] text-lg text-[#3E4A6E]">{t("sub")}</p>
      </div>
      <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => {
          const slot = it.photo ? imageSlot(it.photo) : null;
          return (
            <li key={`${it.name}-${it.location}`} className="flex h-full flex-col gap-4 rounded-[20px] border border-sand bg-white p-6 shadow-[0_1px_2px_rgba(11,24,70,0.04)] sm:p-7">
              <Stars n={Math.max(1, Math.min(5, Math.round(it.rating)))} label={t("ratingLabel", { n: it.rating })} />
              <blockquote className="m-0 flex-1 text-[15.5px] leading-relaxed text-ink">“{it.quote}”</blockquote>
              <div className="flex items-center gap-3 border-t border-sand pt-4">
                {slot?.src ? <ImageSlot id={it.photo!} compact rounded="rounded-full" className="h-12 w-12 flex-none" sizes="48px" /> : <Initials name={it.name} />}
                <div className="min-w-0">
                  <p className="font-bold">{it.name}</p>
                  <p className="text-sm text-[#3E4A6E]">{t("placedAs", { role: it.role, location: it.location })}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-8 text-center">
        <TextLink href="/success-stories" className="inline-flex min-h-11 items-center">
          {t("allStories")}
        </TextLink>
      </p>
    </Section>
  );
}

/** Three team photo slots: "Life at UpayaInd" (home + about). */
export async function TeamGallery({ tone = "paper", title }: { tone?: "paper" | "white"; title?: string }) {
  const t = await getTranslations("marketing.team");
  return (
    <Section tone={tone} labelledBy="team-gallery-title">
      <div className="mb-10 max-w-[720px]">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <H2 id="team-gallery-title" className="mb-4">
          {title ?? t("title")}
        </H2>
        <p className="text-lg text-[#3E4A6E]">{t("sub")}</p>
      </div>
      <ul aria-label={t("label")} className="grid gap-4 sm:grid-cols-3">
        {(["team-1", "team-2", "team-3"] as const).map((id) => (
          <li key={id}>
            <ImageSlot id={id} className="aspect-[4/3]" sizes="(min-width: 640px) 33vw, 100vw" />
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** The client's "Looking for a job?" poster as a homepage band, with an image slot for the artwork. */
export async function PromoBanner({ market, tone = "white" }: { market: HomeMarket; tone?: "paper" | "white" }) {
  const t = await getTranslations("marketing.promo");
  const tags = t.raw("tags") as string[];
  const points = t.raw("points") as { title: string; body: string }[];
  const icons = [
    <path key="a" d="M4 7h16v12H4zM9 7V5h6v2M4 12h16" />,
    <path key="b" d="M7 3h7l4 4v14H7zM14 3v4h4M9 12h6M9 16h6" />,
    <path key="c" d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 11a3 3 0 1 0 0-6M21 20a6 6 0 0 0-5-5.9" />,
    <path key="d" d="M3 5h18v11H3zM8 20h8M12 16v4" />,
  ];
  return (
    <Section tone={tone} label={t("title")}>
      <div className="relative overflow-hidden rounded-[28px] border border-[#D6E3FA] bg-[linear-gradient(135deg,#FFFFFF,#EAF1FE_60%,#E6F6FF)] p-6 sm:p-10 lg:p-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center">
          <div className="min-w-0">
            <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.14em] text-[#5A6585]">{t("eyebrow")}</p>
            <h2 className={cn("font-display text-[44px] font-semibold leading-[1.02] tracking-[-0.025em] sm:text-[60px] lg:text-[72px]")}>
              <span className="text-ink">{t("title").split(" ")[0]}</span> <span className="text-gradient">{t("title").split(" ").slice(1).join(" ")}</span>
            </h2>
            <p className="mt-4 text-xl font-semibold text-ink sm:text-2xl">{t("sub")}</p>
            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[15px] font-medium text-[#3E4A6E]">
              {tags.map((tag, i) => (
                <li key={tag} className="flex items-center gap-3">
                  {i > 0 ? <span aria-hidden="true" className="text-[#9DB9F5]">|</span> : null}
                  {tag}
                </li>
              ))}
            </ul>
            <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {points.map((pt, i) => (
                <li key={pt.title} className="flex flex-col gap-2">
                  <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-white text-royal shadow-[0_1px_2px_rgba(11,24,70,0.08)]">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      {icons[i % icons.length]}
                    </svg>
                  </span>
                  <span className="text-[15px] font-bold leading-tight">{pt.title}</span>
                  <span className="text-[13px] text-[#3E4A6E]">{pt.body}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <Check className="mt-1.5" color="#2563DE" />
                <div>
                  <p className="text-lg font-bold">{t("tagline")}</p>
                  <p className="text-[15px] text-[#3E4A6E]">{t("taglineSub")}</p>
                </div>
              </div>
              <Link href="/pricing" className={cta.primary} {...trackAttrs("cta_get_started", { location: `promo_home_${market.toLowerCase()}`, market })}>
                {t("cta")}
                <ArrowRight />
              </Link>
            </div>
          </div>
          <ImageSlot id="poster-looking-for-job" className="aspect-[9/10] max-h-[520px] w-full" sizes="(min-width: 1024px) 40vw, 100vw" />
        </div>
      </div>
    </Section>
  );
}
