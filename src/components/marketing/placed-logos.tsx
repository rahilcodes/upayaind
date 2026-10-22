import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { Eyebrow, H2, Section } from "./ui";

/**
 * "Trusted by candidates placed at" logo marquee (D-143), ported from the
 * client's previous site. Server component; the scroll is CSS-only
 * (`animate-marquee` in globals.css), pauses on hover and becomes a static
 * wrapped row under `prefers-reduced-motion`.
 */
export const PLACED_LOGOS: { name: string; src: string; width: number; height: number }[] = [
  { name: "Microsoft", src: "/brand/companies/microsoft.webp", width: 3840, height: 819 },
  { name: "TCS", src: "/brand/companies/tcs.png", width: 1280, height: 515 },
  { name: "Amazon", src: "/brand/companies/amazon.png", width: 2400, height: 723 },
  { name: "Infosys", src: "/brand/companies/infosys.png", width: 1280, height: 512 },
];

function LogoRow({ hidden }: { hidden?: boolean }) {
  return (
    <ul aria-hidden={hidden || undefined} className={cn("flex flex-none items-center gap-12 pr-12 sm:gap-20 sm:pr-20 motion-reduce:w-full motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:gap-y-6 motion-reduce:pr-0", hidden && "motion-reduce:hidden")}>
      {PLACED_LOGOS.map((l) => (
        <li key={l.name} className="flex-none">
          <Image
            src={l.src}
            alt={hidden ? "" : l.name}
            width={l.width}
            height={l.height}
            sizes="(min-width: 640px) 200px, 140px"
            loading="lazy"
            className="h-7 w-auto object-contain sm:h-10"
          />
        </li>
      ))}
    </ul>
  );
}

export async function PlacedLogos({ tone = "white" }: { tone?: "paper" | "white" }) {
  const t = await getTranslations("marketing.placed");
  const fade = tone === "white" ? "from-white" : "from-paper";
  return (
    <Section tone={tone} label={t("label")}>
      <div className="mb-8 text-center">
        <Eyebrow className="text-center">{t("eyebrow")}</Eyebrow>
        <H2 className="mb-3">{t("title")}</H2>
        <p className="mx-auto max-w-[560px] text-lg text-[#3E4A6E]">{t("sub")}</p>
      </div>
      <div className="group relative overflow-hidden">
        <div aria-hidden="true" className={cn("pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r to-transparent sm:w-24 motion-reduce:hidden", fade)} />
        <div aria-hidden="true" className={cn("pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l to-transparent sm:w-24 motion-reduce:hidden", fade)} />
        <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused] motion-reduce:w-full motion-reduce:animate-none motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:gap-y-6">
          <LogoRow />
          <LogoRow hidden />
        </div>
      </div>
    </Section>
  );
}
