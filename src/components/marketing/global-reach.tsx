import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { HomeMarket } from "@/lib/market";
import { cn } from "@/lib/utils";
import { H2, Section } from "./ui";

/**
 * "Our global reach" world map with pulsing markers for the three markets
 * (D-143). Markers are positioned by percentage over the image so they stay
 * put at every viewport; the page's own country gets a larger dot and a
 * visible name chip. The ping ring is disabled under `prefers-reduced-motion`.
 */
const MARKERS: { market: HomeMarket; top: string; left: string; color: string }[] = [
  { market: "US", top: "41%", left: "27%", color: "#2563DE" },
  { market: "UK", top: "30%", left: "46.5%", color: "#38B6FF" },
  { market: "IN", top: "56%", left: "69%", color: "#DC2626" },
];

export async function GlobalReach({ market, tone = "paper" }: { market: HomeMarket; tone?: "paper" | "white" }) {
  const t = await getTranslations("marketing.reach");
  const name = (m: HomeMarket) => t(`countries.${m}`);
  return (
    <Section tone={tone} labelledBy="reach-title">
      <div className="mb-10 text-center">
        <H2 id="reach-title" className="mb-3">
          {t("title")}
        </H2>
        <p className="mx-auto max-w-[560px] text-lg text-[#3E4A6E]">{t("sub")}</p>
      </div>
      <div className="relative mx-auto max-w-[760px]">
        <div aria-hidden="true" className="absolute inset-x-[8%] inset-y-[12%] rounded-full bg-sky/25 blur-3xl" />
        <div className="relative">
          <Image src="/brand/map/world-map.png" alt="" width={2100} height={1313} priority={false} sizes="(min-width: 800px) 760px, 100vw" className="h-auto w-full" />
          <ul aria-label={t("markersLabel")} className="absolute inset-0 m-0 list-none p-0">
            {MARKERS.map((m) => {
              const own = m.market === market;
              return (
                <li key={m.market} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ top: m.top, left: m.left }}>
                  <span className={cn("relative flex", own ? "h-5 w-5" : "h-3.5 w-3.5")}>
                    <span aria-hidden="true" className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:hidden" style={{ backgroundColor: m.color }} />
                    <span className="relative inline-flex h-full w-full rounded-full border-2 border-white shadow-[0_1px_4px_rgba(11,24,70,0.25)]" style={{ backgroundColor: m.color }} />
                  </span>
                  {own ? (
                    <span className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-full border border-sand bg-white px-2 py-0.5 text-[11px] font-bold text-ink shadow-sm sm:text-xs">{name(m.market)}</span>
                  ) : (
                    <span className="sr-only">{name(m.market)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <ul aria-label={t("legendLabel")} className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-semibold text-ink">
        {MARKERS.map((m) => (
          <li key={m.market} className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} />
            {name(m.market)}
          </li>
        ))}
      </ul>
    </Section>
  );
}
