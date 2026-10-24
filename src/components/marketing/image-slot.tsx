import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { imageSlot } from "./images";

/**
 * An image slot (D-148): the real picture when `src` is set in images.ts,
 * otherwise a clearly visible placeholder that names the slot and its size so
 * artwork can be produced and dropped in without touching the layout.
 */
export async function ImageSlot({
  id,
  className,
  sizes = "(min-width: 1024px) 50vw, 100vw",
  priority,
  rounded = "rounded-[20px]",
  compact = false,
}: {
  id: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  rounded?: string;
  /** Small slots (avatars): icon + id only. */
  compact?: boolean;
}) {
  const t = await getTranslations("marketing.images");
  const def = imageSlot(id);
  if (!def) return null;
  if (def.src) {
    return (
      <div className={cn("relative overflow-hidden bg-[#E3E6EF]", rounded, className)}>
        <Image src={def.src} alt={def.alt} fill sizes={sizes} priority={priority} className="object-cover" />
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={t("placeholderAria", { what: def.alt })}
      className={cn(
        "relative flex flex-col items-center justify-center gap-1 overflow-hidden border-2 border-dashed border-[#9DB9F5] bg-[linear-gradient(135deg,#EAF1FE,#F7F9FF_55%,#E6F6FF)] text-center text-ink",
        compact ? "p-1" : "p-4",
        rounded,
        className,
      )}
    >
      <svg width={compact ? 18 : 30} height={compact ? 18 : 30} viewBox="0 0 24 24" fill="none" stroke="#2563DE" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2.5" />
        <circle cx="9" cy="10" r="1.8" />
        <path d="M21 16l-5-5-8 8" />
      </svg>
      {compact ? null : (
        <>
          <p className="text-[13px] font-bold">{t("comingSoon")}</p>
          <p className="font-mono text-[11px] text-royal">{id}</p>
          <p className="text-[11px] text-[#3E4A6E]">{def.size}</p>
          <p className="hidden max-w-[260px] text-[11px] text-[#5A6585] sm:block">{def.note}</p>
        </>
      )}
    </div>
  );
}
