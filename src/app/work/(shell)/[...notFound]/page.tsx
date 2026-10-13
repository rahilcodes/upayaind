import { notFound } from "next/navigation";

/**
 * Catch-all so unknown /work/* URLs render the shell's not-found.tsx (with the
 * sidebar) instead of the bare root 404 — DECISIONS D-132. Real routes always
 * win over this segment.
 */
export default function CatchAll() {
  notFound();
}
