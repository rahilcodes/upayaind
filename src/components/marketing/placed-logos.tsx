import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { Eyebrow, H2, Section } from "./ui";

/**
 * "Trusted by candidates placed at" logo marquee (D-143, extended D-148).
 * Four logos are the client's own image files; the rest are brand icons
 * generated from simple-icons (`node scripts/gen-company-logos.mjs`) shown
 * next to the company name so they stay recognisable. Server component; the
 * scroll is CSS-only (`animate-marquee` in globals.css), pauses on hover and
 * becomes a static wrapped row under `prefers-reduced-motion`.
 */
export type PlacedLogo =
  | { kind: "image"; name: string; src: string; width: number; height: number }
  | { kind: "icon"; name: string; slug: string };

const img = (name: string, src: string, width: number, height: number): PlacedLogo => ({ kind: "image", name, src, width, height });
const icon = (name: string, slug: string): PlacedLogo => ({ kind: "icon", name, slug });

export const PLACED_LOGOS: PlacedLogo[] = [
  img("Microsoft", "/brand/companies/microsoft.webp", 3840, 819),
  img("TCS", "/brand/companies/tcs.png", 1280, 515),
  icon("Google", "google"),
  img("Amazon", "/brand/companies/amazon.png", 2400, 723),
  icon("Accenture", "accenture"),
  img("Infosys", "/brand/companies/infosys.png", 1280, 512),
  icon("Meta", "meta"),
  icon("Wipro", "wipro"),
  icon("Cisco", "cisco"),
  icon("HCL", "hcl"),
  icon("Intel", "intel"),
  icon("Goldman Sachs", "goldmansachs"),
  icon("Paytm", "paytm"),
  icon("NVIDIA", "nvidia"),
  icon("Zoho", "zoho"),
  icon("Dell", "dell"),
  icon("PhonePe", "phonepe"),
  icon("SAP", "sap"),
  icon("Barclays", "barclays"),
  icon("HP", "hp"),
  icon("HSBC", "hsbc"),
  icon("Atlassian", "atlassian"),
  icon("Vodafone", "vodafone"),
  icon("Stripe", "stripe"),
];

function LogoRow({ hidden }: { hidden?: boolean }) {
  return (
    <ul aria-hidden={hidden || undefined} className={cn("flex flex-none items-center gap-10 pr-10 sm:gap-16 sm:pr-16 motion-reduce:w-full motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:gap-y-6 motion-reduce:pr-0", hidden && "motion-reduce:hidden")}>
      {PLACED_LOGOS.map((l) => (
        <li key={l.name} className="flex flex-none items-center gap-2.5">
          {l.kind === "image" ? (
            <Image src={l.src} alt={hidden ? "" : l.name} width={l.width} height={l.height} sizes="(min-width: 640px) 200px, 140px" loading="lazy" className="h-7 w-auto object-contain sm:h-10" />
          ) : (
            <>
              <Image src={`/brand/companies/${l.slug}.svg`} alt={hidden ? "" : l.name} width={40} height={40} loading="lazy" unoptimized className="h-7 w-7 object-contain sm:h-9 sm:w-9" />
              <span aria-hidden={hidden || undefined} className="whitespace-nowrap text-[17px] font-bold tracking-[-0.01em] text-[#0B1846] sm:text-[21px]">
                {l.name}
              </span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

export async function PlacedLogos({ tone = "white" }: { tone?: "paper" | "white" }) {
  const t = await getTranslations("marketing.placed");
  const fade = tone === "white" ? "from-white" : "from-[#F3F7FE]";
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
        <div className="flex w-max animate-marquee [animation-duration:70s] group-hover:[animation-play-state:paused] motion-reduce:w-full motion-reduce:animate-none motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:gap-y-6">
          <LogoRow />
          <LogoRow hidden />
        </div>
      </div>
    </Section>
  );
}
