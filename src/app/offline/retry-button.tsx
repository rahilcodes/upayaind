"use client";
import { buttonVariants } from "@/components/ui/button";

/** Full reload: the request goes through the service worker again and succeeds once the network is back. */
export function RetryButton({ label }: { label: string }) {
  return (
    <button type="button" className={buttonVariants({ variant: "primary", size: "lg" })} onClick={() => window.location.assign("/app")}>
      {label}
    </button>
  );
}
