import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold",
  {
    variants: {
      tone: {
        blue: "bg-[#E8EFFE] text-[#0A35D6]",
        violet: "bg-[#F0EAFE] text-[#5B2BC4]",
        amber: "bg-[#FDF3E1] text-[#7A4E0E]",
        cyan: "bg-[#E1F6FD] text-[#0B6C8F]",
        green: "bg-[#E6F4EC] text-[#1E7B4F]",
        "green-solid": "bg-[#1E7B4F] text-white",
        red: "bg-[#FCEAE8] text-[#A82A21]",
        grey: "bg-[#EEF0F5] text-[#4A5578]",
        slate: "bg-[#E4E8F0] text-[#334063]",
        ink: "bg-ink text-white",
        outline: "border border-border-strong text-muted-foreground",
      },
    },
    defaultVariants: { tone: "grey" },
  },
);

export function Badge({
  className,
  tone,
  dot,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot ? <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-current" /> : null}
      {props.children}
    </span>
  );
}
