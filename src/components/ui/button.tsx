import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] font-semibold transition-[background,color,box-shadow,opacity] disabled:pointer-events-none disabled:opacity-55 [&_svg]:shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:brand-gradient shadow-sm",
        ink: "bg-ink text-white hover:bg-ink-700",
        secondary: "bg-accent text-accent-foreground hover:bg-accent/70",
        outline: "border-[1.5px] border-border-strong bg-surface text-foreground hover:bg-surface-muted",
        "outline-ink": "border-[1.5px] border-ink text-ink hover:bg-ink hover:text-white",
        ghost: "text-foreground hover:bg-surface-muted",
        link: "text-primary underline-offset-4 hover:underline px-0 h-auto",
        danger: "bg-danger text-white hover:bg-[#a82a21]",
        success: "bg-success text-white hover:bg-[#17633f]",
        white: "bg-white text-ink hover:bg-white/90",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-[18px] text-[15px]",
        lg: "h-[52px] px-7 text-base",
        xl: "h-14 px-8 text-[17px] rounded-[var(--radius-lg)]",
        icon: "h-11 w-11",
        "icon-sm": "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, loading, children, disabled, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Spinner /> : null}
          {children}
        </>
      )}
    </Comp>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("h-4 w-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
