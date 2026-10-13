"use client";
import * as React from "react";
import { Check, Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Share bar for blog posts (DECISIONS D-134): plain intent links to LinkedIn,
 * X and WhatsApp (no third-party scripts, nothing loaded until clicked) plus
 * copy-to-clipboard. Falls back to a selectable input when the Clipboard API
 * isn't available (http, old browsers).
 */
export function ShareButtons({ url, title, className }: { url: string; title: string; className?: string }) {
  const t = useTranslations("marketing.blog.share");
  const [copied, setCopied] = React.useState<"idle" | "ok" | "fail">("idle");
  const eu = encodeURIComponent(url);
  const et = encodeURIComponent(title);
  const links = [
    { id: "linkedin", label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${eu}`, icon: LinkedInIcon },
    { id: "x", label: "X", href: `https://twitter.com/intent/tweet?url=${eu}&text=${et}`, icon: XIcon },
    { id: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`, icon: WhatsAppIcon },
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    window.setTimeout(() => setCopied("idle"), 2500);
  }

  const btn = "inline-flex min-h-11 items-center gap-2 rounded-full border border-sand bg-white px-4 text-sm font-semibold text-ink transition-colors hover:border-royal hover:text-royal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="mr-1 text-sm font-semibold text-[#5A6585]">{t("label")}</span>
      {links.map((l) => (
        <a key={l.id} href={l.href} target="_blank" rel="noopener noreferrer" className={btn} aria-label={t("on", { network: l.label })} data-track={`share_${l.id}`}>
          <l.icon className="h-4 w-4" />
          <span>{l.label}</span>
        </a>
      ))}
      <button type="button" onClick={copy} className={btn} aria-live="polite" data-track="share_copy">
        {copied === "ok" ? <Check className="h-4 w-4 text-[#1E7B4F]" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
        <span>{copied === "ok" ? t("copied") : copied === "fail" ? t("copyFailed") : t("copy")}</span>
      </button>
      {copied === "fail" ? <input readOnly value={url} aria-label={t("copy")} onFocus={(e) => e.currentTarget.select()} className="min-h-11 w-full rounded-[10px] border border-sand px-3 text-sm sm:w-auto sm:min-w-[280px]" /> : null}
    </div>
  );
}

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zm1.78 13.02H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64z" />
    </svg>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.91-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.05 21.8h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.9-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.89 9.88zm8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.33.16 11.89c0 2.1.55 4.14 1.59 5.95L0 24l6.3-1.65a11.88 11.88 0 0 0 5.74 1.46h.01c6.55 0 11.89-5.33 11.89-11.89 0-3.18-1.24-6.16-3.48-8.41z" />
    </svg>
  );
}
