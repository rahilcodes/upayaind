"use client";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Building blocks for route `loading.tsx` files (DECISIONS D-132). Each page
 * skeleton mirrors the real page's layout (header, stat cards, table rows) so
 * the transition doesn't jump. The wrapper announces the busy state once
 * (role="status" + aria-busy) and hides the decorative blocks from readers.
 */
export function LoadingPage({ children, className, label }: { children: React.ReactNode; className?: string; label?: string }) {
  const t = useTranslations("system.loading");
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label ?? t("page")}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

export function HeaderSkeleton({ actions = 1, description = true }: { actions?: number; description?: boolean }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-8 w-[min(260px,70%)]" />
        {description ? <Skeleton className="mt-2 h-4 w-[min(420px,90%)]" /> : null}
      </div>
      {actions > 0 ? (
        <div className="flex gap-2.5">
          {Array.from({ length: actions }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-28" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function StatsSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4", count >= 5 ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : count === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2 lg:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-[var(--radius-xl)] border border-border bg-surface p-5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-3 h-7 w-16" />
          <Skeleton className="mt-2 h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ lines = 3, className, title = true }: { lines?: number; className?: string; title?: boolean }) {
  return (
    <div className={cn("rounded-[var(--radius-xl)] border border-border bg-surface p-5", className)}>
      {title ? <Skeleton className="mb-4 h-5 w-40" /> : null}
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={cn("h-4", i % 3 === 0 ? "w-full" : i % 3 === 1 ? "w-5/6" : "w-2/3")} />
        ))}
      </div>
    </div>
  );
}

export function FiltersSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <Skeleton className="h-11 w-full sm:w-64" />
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-32" />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 5, className }: { rows?: number; cols?: number; className?: string }) {
  const widths = ["w-40", "w-24", "w-32", "w-20", "w-16", "w-28", "w-24"];
  return (
    <div className={cn("overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface", className)}>
      <div className="flex gap-6 border-b border-border bg-surface-muted/60 px-5 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className={cn("h-3.5", widths[i % widths.length], i > 2 && "hidden md:block")} />
        ))}
      </div>
      <ul className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <li key={r} className="flex items-center gap-6 px-5 py-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={cn("h-4", widths[(c + r) % widths.length], c > 2 && "hidden md:block", c === 0 && "min-w-24")} />
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ListSkeleton({ rows = 6, avatar = false }: { rows?: number; avatar?: boolean }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-4 px-5 py-4">
          {avatar ? <Skeleton className="h-10 w-10 shrink-0 rounded-full" /> : null}
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-[min(220px,60%)]" />
            <Skeleton className="mt-2 h-3.5 w-[min(340px,85%)]" />
          </div>
          <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
        </li>
      ))}
    </ul>
  );
}

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-[var(--radius-xl)] border border-border bg-surface p-5", className)}>
      <Skeleton className="mb-5 h-5 w-40" />
      <div className="flex h-44 items-end gap-2">
        {[40, 65, 50, 80, 55, 90, 70, 45, 75, 60, 85, 50].map((h, i) => (
          <div key={i} className="flex-1 animate-pulse rounded-[var(--radius-md)] bg-track" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

export function MessagesSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <ListSkeleton rows={6} avatar />
      <div className="hidden min-h-[420px] flex-col rounded-[var(--radius-xl)] border border-border bg-surface lg:flex">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex-1 space-y-4 p-5">
          <Skeleton className="h-12 w-[60%] rounded-[16px]" />
          <Skeleton className="ml-auto h-12 w-[55%] rounded-[16px]" />
          <Skeleton className="h-16 w-[70%] rounded-[16px]" />
          <Skeleton className="ml-auto h-10 w-[40%] rounded-[16px]" />
        </div>
        <div className="border-t border-border p-4">
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </div>
  );
}
