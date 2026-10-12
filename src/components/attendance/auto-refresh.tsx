"use client";
import * as React from "react";
import { useRouter } from "next/navigation";

/** Re-render the server component every `seconds` while the tab is visible (live boards). */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return null;
}
