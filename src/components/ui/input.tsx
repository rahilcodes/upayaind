import * as React from "react";
import { cn } from "@/lib/utils";

const field =
  "w-full rounded-[var(--radius-md)] border-[1.5px] border-border-strong bg-surface px-3.5 text-[15px] text-foreground placeholder:text-subtle-foreground/80 transition-[border,box-shadow] focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(field, "h-12", className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(field, "min-h-28 py-3 leading-relaxed", className)} {...props} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <div className="relative">
        <select ref={ref} className={cn(field, "h-12 appearance-none pr-10", className)} {...props}>
          {children}
        </select>
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    );
  },
);

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-semibold text-foreground", className)} {...props} />;
}

export function Checkbox({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn("h-[18px] w-[18px] shrink-0 cursor-pointer rounded accent-[var(--primary)]", className)}
      {...props}
    />
  );
}

/** Label + control + hint + announced error (WCAG: errors are linked and live). */
export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
  labelAside,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | string[] | null;
  children: React.ReactNode;
  className?: string;
  labelAside?: React.ReactNode;
}) {
  const msg = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {labelAside}
      </div>
      {children}
      {hint && !msg ? (
        <p id={`${id}-hint`} className="text-[13px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {msg ? (
        <p id={`${id}-error`} role="alert" className="text-[13px] font-medium text-danger">
          {msg}
        </p>
      ) : null}
    </div>
  );
}

export function fieldA11y(id: string, error?: string | string[] | null, hint?: boolean) {
  const invalid = Boolean(Array.isArray(error) ? error.length : error);
  return {
    id,
    name: id,
    "aria-invalid": invalid || undefined,
    "aria-describedby": invalid ? `${id}-error` : hint ? `${id}-hint` : undefined,
  } as const;
}
