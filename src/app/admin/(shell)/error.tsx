"use client";
import { RouteError } from "@/components/portal/route-error";

/** Error boundary for every /admin page (keeps the shell mounted) — DECISIONS D-132. */
export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} home="/admin" />;
}
