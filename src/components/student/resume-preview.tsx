"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

type Page = { src: string; width: number; height: number };

/**
 * Read-only preview of a saved resume version (page images from
 * POST /api/resumes/preview — PDFs can't be framed under our CSP, D-027).
 */
export function ResumePreview({ studentId, versionId, title }: { studentId: string; versionId: string; title: string }) {
  const t = useTranslations("student.preview");
  const [pages, setPages] = React.useState<Page[] | null>(null);
  const [error, setError] = React.useState(false);
  React.useEffect(() => {
    const ac = new AbortController();
    fetch("/api/resumes/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId, versionId }), signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const b = (await r.json()) as { pages: Page[] };
        setPages(b.pages);
      })
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setError(true);
      });
    return () => ac.abort();
  }, [studentId, versionId]);

  if (error) return <p className="rounded-[12px] bg-surface-muted px-4 py-8 text-center text-sm text-muted-foreground">{t("error")}</p>;
  if (!pages)
    return (
      <div role="status" className="flex aspect-[8.5/11] w-full items-center justify-center rounded-[12px] bg-surface-muted text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        {t("loading")}
      </div>
    );
  return (
    <div className="grid gap-3">
      {pages.map((p, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={p.src} width={p.width} height={p.height} alt={t("pageAlt", { title, n: i + 1, total: pages.length })} className="h-auto w-full rounded-[10px] border border-border bg-white shadow-[var(--shadow-card)]" />
      ))}
    </div>
  );
}
