import { useTranslations } from "next-intl";
import type { AttendanceStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

export const ATT_STYLE: Record<AttendanceStatus | "LIVE", string> = {
  PRESENT: "bg-[#E6F4EC] text-[#1E7B4F] dark:bg-success/20 dark:text-[#7BD3A5]",
  HALF_DAY: "bg-[#FDF3E1] text-[#7A4E0E] dark:bg-warning/20 dark:text-[#F1C27D]",
  ABSENT: "bg-[#FCEAE8] text-[#A82A21] dark:bg-danger/20 dark:text-[#F3A29B]",
  ON_LEAVE: "bg-[#F0EAFE] text-[#5B2BC4] dark:bg-[#5B2BC4]/25 dark:text-[#C9B5FA]",
  HOLIDAY: "bg-[#E1F6FD] text-[#0B6C8F] dark:bg-sky/20 dark:text-sky",
  WEEKEND: "bg-[#EEF0F5] text-[#4A5578] dark:bg-surface-muted dark:text-muted-foreground",
  LIVE: "bg-[#E8EFFE] text-[#0A35D6] dark:bg-accent dark:text-accent-foreground",
};

/** Attendance status chip (text label + colour). `null` = today, still in progress. */
export function AttendancePill({ status, className }: { status: AttendanceStatus | null; className?: string }) {
  const t = useTranslations("attendance");
  const tw = useTranslations("work.timesheet");
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold", ATT_STYLE[status ?? "LIVE"], className)}>{status ? t(status) : tw("today")}</span>;
}

export const hm = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
