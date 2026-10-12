"use client";
import * as React from "react";
import { DropdownMenu as M } from "radix-ui";
import { cn } from "@/lib/utils";

export const Dropdown = M.Root;
export const DropdownTrigger = M.Trigger;

export function DropdownContent({ className, align = "end", ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={8}
        className={cn(
          "portal z-50 min-w-[220px] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface p-1.5 text-foreground shadow-[var(--shadow-float)]",
          className,
        )}
        {...props}
      />
    </M.Portal>
  );
}

export function DropdownItem({ className, ...props }: React.ComponentProps<typeof M.Item>) {
  return (
    <M.Item
      className={cn(
        "flex min-h-10 cursor-pointer select-none items-center gap-2.5 rounded-[var(--radius-sm)] px-3 text-sm outline-none data-[highlighted]:bg-surface-muted data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("px-3 py-2 text-xs font-semibold text-muted-foreground", className)} {...props} />;
}

export function DropdownSeparator() {
  return <M.Separator className="my-1 h-px bg-border" />;
}
