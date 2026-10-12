import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

/** Stat tile from the approved dashboard design. */
export function StatCard({
  label,
  value,
  suffix,
  hint,
  progress,
  tone = "default",
  className,
  children,
}: {
  label: string;
  value: React.ReactNode;
  suffix?: React.ReactNode;
  hint?: React.ReactNode;
  progress?: { value: number; max: number; label: string };
  tone?: "default" | "success" | "warning";
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-[16px] border border-border bg-surface px-5 py-[18px]", className)}>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-[30px] font-bold leading-tight tabular", tone === "success" && "text-success", tone === "warning" && "text-warning")}>
        {value}
        {suffix ? <span className="ml-1 text-base font-medium text-muted-foreground">{suffix}</span> : null}
      </p>
      {progress ? <Progress className="mt-2.5" value={progress.value} max={progress.max} label={progress.label} /> : null}
      {hint ? <div className="mt-1.5 text-[13px] text-muted-foreground">{hint}</div> : null}
      {children}
    </div>
  );
}
