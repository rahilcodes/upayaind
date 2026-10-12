import * as React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  body,
  action,
  icon,
  className,
}: {
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-dashed border-border-strong px-6 py-12 text-center", className)}>
      {icon ? <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] bg-accent text-accent-foreground">{icon}</div> : null}
      <p className="text-base font-bold">{title}</p>
      {body ? <div className="max-w-md text-sm text-muted-foreground">{body}</div> : null}
      {action}
    </div>
  );
}
