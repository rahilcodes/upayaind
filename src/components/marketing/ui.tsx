import Link from "next/link";
import { cn } from "@/lib/utils";

/** Marketing building blocks matching the approved homepage design. */

export const container = "mx-auto w-full max-w-[1200px]";
export const sectionPad = "px-4 py-16 sm:px-6 sm:py-20 lg:py-24";
export const h2Class = "font-display text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[38px] lg:text-[46px] text-balance";
export const h1Class = "font-display text-[40px] font-semibold leading-[1.05] tracking-[-0.025em] sm:text-[52px] lg:text-[60px] text-balance";
export const leadClass = "text-[17px] leading-relaxed text-[#3E4A6E] sm:text-lg";
export const bodyMuted = "text-[#3E4A6E]";

export function Section({
  id,
  tone = "paper",
  className,
  inner,
  children,
  label,
  labelledBy,
}: {
  id?: string;
  tone?: "paper" | "white" | "ink" | "tint";
  className?: string;
  inner?: string;
  children: React.ReactNode;
  label?: string;
  labelledBy?: string;
}) {
  // "paper" is transparent so the marketing gradient (`mk-bg`, D-148) shows through; white bands stay solid.
  const bg = { paper: "bg-transparent", white: "bg-white", ink: "brand-deep text-white", tint: "bg-[#F1F4FB]" }[tone];
  return (
    <section id={id} aria-label={label} aria-labelledby={labelledBy} className={cn(sectionPad, bg, id && "scroll-mt-6", className)}>
      <div className={cn(container, inner)}>{children}</div>
    </section>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("eyebrow mb-3", className)}>{children}</p>;
}

export function H2({ id, children, className }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <h2 id={id} className={cn(h2Class, className)}>
      {children}
    </h2>
  );
}

export function PageHero({
  eyebrow,
  title,
  sub,
  children,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  sub?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("relative overflow-hidden px-4 pb-14 pt-14 sm:px-6 sm:pb-16 sm:pt-20", className)}>
      <RisingArrow className="pointer-events-none absolute -right-24 -top-6 hidden w-[520px] opacity-[0.10] md:block" stroke="#2563DE" />
      <div className={cn(container, "relative")}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className={cn(h1Class, "max-w-[860px]")}>{title}</h1>
        {sub ? <p className={cn(leadClass, "mt-5 max-w-[680px]")}>{sub}</p> : null}
        {children}
      </div>
    </section>
  );
}

/** The logo's rising arrow, reused as a motif (SPEC §13). */
export function RisingArrow({ className, stroke = "#38B6FF", width = 10 }: { className?: string; stroke?: string; width?: number }) {
  return (
    <svg viewBox="0 0 520 260" aria-hidden="true" focusable="false" className={className}>
      <path d="M10 240 L170 140 L270 190 L500 30" fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M420 30 H500 V110" fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Check({ className, color = "#1E7B4F" }: { className?: string; color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" aria-hidden="true" focusable="false" className={cn("shrink-0", className)}>
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}

export function ArrowRight({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={cn("shrink-0", className)}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

const ctaBase =
  "inline-flex min-h-[54px] items-center justify-center gap-2.5 rounded-[12px] px-7 text-[17px] font-semibold no-underline transition-[background,color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2";

export const cta = {
  primary: cn(ctaBase, "bg-royal text-white shadow-[0_10px_24px_-12px_rgba(42,106,233,0.7)] hover:bg-royal-600 hover:text-white"),
  outline: cn(ctaBase, "border-[1.5px] border-royal bg-white px-6 text-royal hover:bg-[#EAF1FE] hover:text-royal-600"),
  white: cn(ctaBase, "bg-white font-bold text-ink hover:bg-[#E8EDFB] hover:text-ink"),
  outlineWhite: cn(ctaBase, "border-[1.5px] border-white px-6 text-white hover:bg-white hover:text-ink"),
};

export function TextLink({ href, children, className, ...rest }: React.ComponentProps<typeof Link>) {
  return (
    <Link href={href} className={cn("font-semibold text-royal underline-offset-4 hover:text-ink hover:underline", className)} {...rest}>
      {children}
    </Link>
  );
}

/** Rich text from the CMS. The HTML was generated server-side from allow-listed Tiptap JSON. */
export function Prose({ html, className }: { html: string; className?: string }) {
  return <div className={cn("cms-prose", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Breadcrumbs({ items, label }: { items: { href?: string; label: string }[]; label: string }) {
  return (
    <nav aria-label={label} className="mb-6 text-sm text-[#5A6585]">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 ? <span aria-hidden="true">/</span> : null}
            {it.href ? (
              <Link href={it.href} className="inline-flex min-h-11 items-center font-medium text-royal hover:underline">
                {it.label}
              </Link>
            ) : (
              <span aria-current="page">{it.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
