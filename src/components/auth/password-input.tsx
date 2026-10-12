"use client";
import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

export function PasswordInput({
  showLabel,
  hideLabel,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { showLabel: string; hideLabel: string }) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-12" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? hideLabel : showLabel}
        aria-pressed={show}
        className="absolute right-0.5 top-0.5 inline-flex h-11 w-11 items-center justify-center rounded-[8px] text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
      </button>
    </div>
  );
}
