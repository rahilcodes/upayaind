import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { mediaUrl, type PublicEntry } from "@/server/services/cms";
import { formatCount, type Story } from "./data";
import { trackAttrs } from "./track";
import { ArrowRight, Eyebrow, H2, RisingArrow, Section, cta, h2Class } from "./ui";

export function StoryPhoto({ story, size = 56, className }: { story: Story; size?: number; className?: string }) {
  const s = story.story;
  if (s.photoId) {
    return (
      <Image
        src={mediaUrl(s.photoId)}
        alt={s.photoAlt || s.studentName}
        width={size}
        height={size}
        sizes={`${size}px`}
        className={cn("flex-none rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = s.studentName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span aria-hidden="true" className={cn("flex flex-none items-center justify-center rounded-full bg-[#E3E6EF] font-bold text-[#3E4A6E]", className)} style={{ width: size, height: size, fontSize: size * 0.34 }}>
      {initials}
    </span>
  );
}

export async function StoryCard({ story, headingLevel = 3 }: { story: Story; headingLevel?: 2 | 3 }) {
  const t = await getTranslations("marketing.stories");
  const s = story.story;
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className="relative flex flex-col gap-5 rounded-[20px] border border-sand bg-paper p-7 transition-shadow focus-within:shadow-[0_0_0_3px_rgba(37, 99, 222,0.35)] hover:shadow-[0_20px_40px_-24px_rgba(11,24,70,0.35)]">
      <div className="flex items-center gap-3.5">
        <StoryPhoto story={story} />
        <div className="min-w-0">
          <H className="text-base font-bold">
            <Link href={`/success-stories/${story.slug}`} className="text-ink no-underline after:absolute after:inset-0 after:rounded-[20px] focus-visible:outline-none">
              {s.studentName}
            </Link>
          </H>
          <p className="text-sm text-[#3E4A6E]">{t("roleAt", { role: s.role, company: s.company })}</p>
        </div>
      </div>
      <blockquote className="m-0 font-display text-[19px] leading-[1.4]">“{s.quote}”</blockquote>
      {s.weeksToOffer != null || s.applicationsSent != null ? (
        <dl className="mt-auto flex gap-6 border-t border-sand pt-4 text-sm">
          {s.weeksToOffer != null ? (
            <div className="flex flex-col-reverse">
              <dt className="text-[#5A6585]">{t("toOffer")}</dt>
              <dd className="text-lg font-bold tabular">{t("weeks", { n: s.weeksToOffer })}</dd>
            </div>
          ) : null}
          {s.applicationsSent != null ? (
            <div className="flex flex-col-reverse">
              <dt className="text-[#5A6585]">{t("applications")}</dt>
              <dd className="text-lg font-bold tabular">{formatCount(s.applicationsSent)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </article>
  );
}

/** FAQ accordion (native <details>: zero JS). */
export function FaqList({ items, className }: { items: { q: string; html: string }[]; className?: string }) {
  return (
    <div className={className}>
      {items.map((f, i) => (
        <details key={i} className="group border-b border-sand py-[18px]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold sm:text-lg [&::-webkit-details-marker]:hidden">
            <span>{f.q}</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563DE" strokeWidth="2.2" aria-hidden="true" className="flex-none transition-transform group-open:rotate-45">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </summary>
          <div className="cms-prose mt-3 !text-base text-[#3E4A6E]" dangerouslySetInnerHTML={{ __html: f.html }} />
        </details>
      ))}
    </div>
  );
}

export function faqItems(entries: PublicEntry[]) {
  return entries.map((e) => ({ q: e.title, html: e.bodyHtml || `<p>${(e.excerpt ?? "").replace(/</g, "&lt;")}</p>` }));
}

export async function FinalCta({ calcom }: { calcom: boolean }) {
  const t = await getTranslations("marketing.cta");
  return (
    <section className="bg-paper px-4 py-6 sm:px-6">
      <div className="relative mx-auto max-w-[1200px] overflow-hidden rounded-[28px] brand-deep px-6 py-16 text-center text-white sm:px-10 sm:py-[72px]">
        <RisingArrow className="pointer-events-none absolute -bottom-10 -right-16 w-[340px] opacity-35 sm:w-[520px]" />
        <h2 className={cn(h2Class, "relative mx-auto max-w-[820px] lg:text-[52px]")}>{t("title")}</h2>
        <p className="relative mx-auto mb-8 mt-4 max-w-[560px] text-lg text-[#EEF4FF]">{t("sub")}</p>
        <div className="relative flex flex-wrap justify-center gap-3">
          <Link href="/pricing" className={cta.white} {...trackAttrs("cta_get_started", { location: "final_cta" })}>
            {t("getStarted")}
          </Link>
          <Link href={calcom ? "/contact#book" : "/contact"} className={cta.outlineWhite} {...trackAttrs("cta_book_call", { location: "final_cta" })}>
            {t("bookCall")}
          </Link>
        </div>
      </div>
    </section>
  );
}

export async function Audiences({ items, tone = "paper" }: { items: PublicEntry[]; tone?: "paper" | "white" }) {
  const t = await getTranslations("marketing.audiences");
  if (!items.length) return null;
  return (
    <Section tone={tone} labelledBy="audiences-title">
      <H2 id="audiences-title" className="mb-10">
        {t("title")}
      </H2>
      <ul className="grid gap-5 md:grid-cols-3">
        {items.map((a) => (
          <li key={a.id}>
            <Link
              href={`/for/${a.slug}`}
              aria-label={t("learnMoreAbout", { title: a.title })}
              className="group block h-full rounded-[18px] border border-sand bg-white p-7 text-ink no-underline transition-shadow hover:text-ink hover:shadow-[0_20px_40px_-24px_rgba(11,24,70,0.35)]"
            >
              <span className="mb-2 block text-[19px] font-bold">{a.title}</span>
              {a.excerpt ? <span className="mb-4 block text-[#3E4A6E]">{a.excerpt}</span> : null}
              <span className="inline-flex items-center gap-1.5 font-semibold text-royal">
                {t("learnMore")}
                <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export async function PrepSection({ tone = "paper" }: { tone?: "paper" | "white" }) {
  const t = await getTranslations("marketing.prep");
  const items = t.raw("items") as { title: string; body: string }[];
  return (
    <Section tone={tone} labelledBy="prep-title" inner="flex flex-col gap-12 lg:flex-row lg:items-center">
      <div className="min-w-0 lg:flex-[1_1_380px]">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <H2 id="prep-title" className="mb-4">
          {t("title")}
        </H2>
        <p className="text-lg text-[#3E4A6E]">{t("sub")}</p>
      </div>
      <ul className="grid min-w-0 gap-4 sm:grid-cols-2 lg:flex-[1_1_520px]">
        {items.map((it) => (
          <li key={it.title} className="rounded-[16px] border border-sand bg-white p-[22px]">
            <h3 className="mb-1.5 font-bold">{it.title}</h3>
            <p className="text-[15px] text-[#3E4A6E]">{it.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
