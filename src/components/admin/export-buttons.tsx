import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/** CSV + XLSX download links for an export route, keeping the current filters. */
export function ExportButtons({ href, params, csvLabel, xlsxLabel }: { href: string; params: Record<string, string | undefined>; csvLabel: string; xlsxLabel?: string }) {
  const build = (format: string) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "cursor") sp.set(k, v);
    sp.set("format", format);
    return `${href}?${sp.toString()}`;
  };
  return (
    <>
      <a href={build("csv")} className={buttonVariants({ variant: "outline", size: "sm" })} download>
        <Download className="h-4 w-4" aria-hidden="true" />
        {csvLabel}
      </a>
      {xlsxLabel ? (
        <a href={build("xlsx")} className={buttonVariants({ variant: "outline", size: "sm" })} download>
          <Download className="h-4 w-4" aria-hidden="true" />
          {xlsxLabel}
        </a>
      ) : null}
    </>
  );
}
