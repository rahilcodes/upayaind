import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/** Cursor pagination (SPEC §12: cursor-based, 25/page). Pass hrefs built with the next/prev cursor. */
export function Pagination({ prevHref, nextHref, label }: { prevHref?: string | null; nextHref?: string | null; label?: string }) {
  if (!prevHref && !nextHref) return null;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex gap-2">
        {prevHref ? (
          <Link href={prevHref} className={buttonVariants({ variant: "outline", size: "sm" })} rel="prev">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
          </Link>
        ) : null}
        {nextHref ? (
          <Link href={nextHref} className={buttonVariants({ variant: "outline", size: "sm" })} rel="next">
            Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

/** Build a URL keeping current search params, overriding some. */
export function withParams(base: string, current: Record<string, string | undefined>, patch: Record<string, string | null | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) if (v) sp.set(k, v);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") sp.delete(k);
    else sp.set(k, v);
  }
  const q = sp.toString();
  return q ? `${base}?${q}` : base;
}
