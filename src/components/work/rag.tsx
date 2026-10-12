import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type RagKey = "green" | "amber" | "red" | "off" | "done" | "rest";

/** Pill + bar colours from the approved design (text label always shown, never colour alone). */
export const RAG_STYLE: Record<RagKey, { pill: string; bar: string }> = {
  green: { pill: "bg-[#E6F4EC] text-[#1E7B4F] dark:bg-success/20 dark:text-[#7BD3A5]", bar: "bg-success" },
  done: { pill: "bg-[#E6F4EC] text-[#1E7B4F] dark:bg-success/20 dark:text-[#7BD3A5]", bar: "bg-success" },
  amber: { pill: "bg-[#FDF3E1] text-[#8A5A12] dark:bg-warning/20 dark:text-[#F1C27D]", bar: "bg-warning" },
  red: { pill: "bg-[#FCEAE8] text-[#A82A21] dark:bg-danger/20 dark:text-[#F3A29B]", bar: "bg-danger" },
  off: { pill: "bg-[#EEF0F5] text-[#4A5578] dark:bg-surface-muted dark:text-muted-foreground", bar: "bg-[#B5BCCD]" },
  rest: { pill: "bg-[#EEF0F5] text-[#4A5578] dark:bg-surface-muted dark:text-muted-foreground", bar: "bg-[#B5BCCD]" },
};

export function RagPill({ rag, className }: { rag: RagKey; className?: string }) {
  const t = useTranslations("work.rag");
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold", RAG_STYLE[rag].pill, className)}>
      <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-current" />
      {t(rag)}
    </span>
  );
}

export function RagBar({ done, target, rag, label }: { done: number; target: number; rag: RagKey; label: string }) {
  const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={target || 1} aria-valuenow={Math.min(done, target)} className="h-2 overflow-hidden rounded-full bg-track">
      <div className={cn("h-2 rounded-full", RAG_STYLE[rag].bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}
