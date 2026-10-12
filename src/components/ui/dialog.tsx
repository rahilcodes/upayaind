"use client";
import * as React from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  wide,
  ...props
}: React.ComponentProps<typeof D.Content> & { title: React.ReactNode; description?: React.ReactNode; wide?: boolean }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-ink/45 backdrop-blur-[2px] data-[state=open]:animate-in" />
      <D.Content
        className={cn(
          "portal fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[var(--radius-2xl)] border border-border bg-surface p-6 text-foreground shadow-[var(--shadow-float)] focus:outline-none",
          wide ? "max-w-2xl" : "max-w-lg",
          className,
        )}
        {...props}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <D.Title className="text-xl font-bold">{title}</D.Title>
            {description ? (
              <D.Description className="mt-1 text-sm text-muted-foreground">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</D.Description>
            )}
          </div>
          <D.Close
            aria-label="Close"
            className="-mr-2 -mt-2 inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] text-muted-foreground hover:bg-surface-muted"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}

export function Sheet({
  open,
  onOpenChange,
  title,
  side = "left",
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  side?: "left" | "right";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-ink/45" />
        <D.Content
          className={cn(
            "fixed top-0 z-50 h-full w-[min(86vw,340px)] overflow-y-auto shadow-[var(--shadow-float)] focus:outline-none",
            side === "left" ? "left-0" : "right-0",
            className,
          )}
        >
          <D.Title className="sr-only">{title}</D.Title>
          <D.Description className="sr-only">{title}</D.Description>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
