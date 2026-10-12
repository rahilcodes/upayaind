"use client";
import * as React from "react";
import { track } from "@/components/marketing/track";

/**
 * Cal.com "Book a free call" (SPEC §6.4). The iframe is only created when the
 * visitor asks for it (or the section scrolls into view after a click from
 * elsewhere via #book), so it costs nothing on first load.
 */
export function CalEmbed({ link, label, title }: { link: string; label: string; title: string }) {
  const [show, setShow] = React.useState(false);
  React.useEffect(() => {
    if (location.hash === "#book") setShow(true);
  }, []);
  const src = React.useMemo(() => {
    try {
      const u = new URL(link.startsWith("http") ? link : `https://cal.com/${link.replace(/^\/+/, "")}`);
      if (!/(^|\.)cal\.com$/.test(u.hostname)) return null;
      u.searchParams.set("embed", "true");
      u.searchParams.set("theme", "light");
      return u.toString();
    } catch {
      return null;
    }
  }, [link]);
  if (!src) return null;
  if (!show) {
    return (
      <button
        type="button"
        onClick={() => {
          setShow(true);
          track("cta_book_call", { location: "contact" });
        }}
        className="inline-flex min-h-[52px] items-center justify-center rounded-[12px] bg-white px-6 text-base font-bold text-ink hover:bg-[#E8EDFB]"
      >
        {label}
      </button>
    );
  }
  return <iframe src={src} title={title} loading="lazy" className="h-[640px] w-full rounded-[14px] border-0 bg-white" />;
}
