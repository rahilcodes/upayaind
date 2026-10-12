"use client";
import * as React from "react";
import type { ResumeData } from "@/resume/schema";

export type PreviewPage = { src: string; width: number; height: number };

/**
 * Live preview: POSTs the (unsaved) resume JSON to /api/resumes/preview,
 * debounced, aborting stale requests, so each edit re-renders within ~1 s.
 */
export function usePreview(studentId: string, content: ResumeData | null, delay = 450) {
  const [pages, setPages] = React.useState<PreviewPage[]>([]);
  const [pageCount, setPageCount] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const ctrl = React.useRef<AbortController | null>(null);
  const key = React.useMemo(() => (content ? JSON.stringify(content) : ""), [content]);

  React.useEffect(() => {
    if (!key) return;
    const timer = window.setTimeout(async () => {
      ctrl.current?.abort();
      const ac = new AbortController();
      ctrl.current = ac;
      setLoading(true);
      try {
        const res = await fetch("/api/resumes/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId, content: JSON.parse(key) }),
          signal: ac.signal,
        });
        const body = (await res.json()) as { pages?: PreviewPage[]; pageCount?: number; error?: string };
        if (!res.ok) throw new Error(body.error ?? "Preview failed");
        setPages(body.pages ?? []);
        setPageCount(body.pageCount ?? 0);
        setError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        if (ctrl.current === ac) setLoading(false);
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [key, studentId, delay]);

  React.useEffect(() => () => ctrl.current?.abort(), []);
  return { pages, pageCount, loading, error };
}
