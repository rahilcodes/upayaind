import { cn, clamp } from "@/lib/utils";

export function Progress({
  value,
  max = 100,
  className,
  barClassName,
  label,
  tone = "brand",
}: {
  value: number;
  max?: number;
  className?: string;
  barClassName?: string;
  label: string;
  tone?: "brand" | "green" | "amber" | "red" | "grey";
}) {
  const pct = max > 0 ? clamp((value / max) * 100, 0, 100) : 0;
  const toneClass = {
    brand: "brand-gradient",
    green: "bg-success",
    amber: "bg-warning",
    red: "bg-danger",
    grey: "bg-[#B5BCCD]",
  }[tone];
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-track", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500", toneClass, barClassName)} style={{ width: `${pct}%` }} />
    </div>
  );
}
