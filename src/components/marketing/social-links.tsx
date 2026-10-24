import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { SOCIAL_ICONS, SOCIAL_ORDER, type SocialNetwork } from "./social-icons";

export type SocialLinksValue = Partial<Record<SocialNetwork, string>>;

/** Icon links to the company's social profiles (D-148). Empty URLs are skipped. */
export async function SocialLinks({ links, className, size = 22, tone = "muted" }: { links: SocialLinksValue; className?: string; size?: number; tone?: "muted" | "white" }) {
  const t = await getTranslations("marketing.footer");
  const items = SOCIAL_ORDER.filter((k) => (links[k] ?? "").trim().length > 0);
  if (!items.length) return null;
  const cls = tone === "white" ? "text-white/85 hover:bg-white/15 hover:text-white" : "text-[#3E4A6E] hover:bg-[#EAF1FE] hover:text-royal";
  return (
    <ul aria-label={t("follow")} className={cn("flex flex-wrap items-center gap-1", className)}>
      {items.map((k) => (
        <li key={k}>
          <a href={links[k]} target="_blank" rel="noopener noreferrer" aria-label={t(`social.${k}`)} className={cn("inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors", cls)}>
            <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
              <path d={SOCIAL_ICONS[k].path} />
            </svg>
          </a>
        </li>
      ))}
    </ul>
  );
}
