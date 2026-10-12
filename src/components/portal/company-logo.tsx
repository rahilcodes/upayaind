/* eslint-disable @next/next/no-img-element */
"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Company favicon with a lettermark fallback (SPEC F6: Clearbit-style favicon fallback). */
export function CompanyLogo({ name, domain, size = 36, className }: { name: string; domain?: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const letter = name.trim()[0]?.toUpperCase() ?? "?";
  if (domain && !failed) {
    return (
      <img
        src={`https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-[9px] border border-border bg-white object-contain p-1", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center justify-center rounded-[9px] bg-ink font-bold text-white", className)} style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {letter}
    </span>
  );
}
