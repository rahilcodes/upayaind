import { notFound } from "next/navigation";

/** Catch-all so unknown /coach/* URLs render the shell's not-found.tsx (DECISIONS D-132). */
export default function CatchAll() {
  notFound();
}
