import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Download, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { buttonVariants } from "@/components/ui/button";
import { requireStudent } from "@/server/auth/guards";
import { getPrepResource } from "@/server/services/prep";
import "@/components/marketing/prose.css";

export const metadata: Metadata = { title: "Interview prep" };
export const dynamic = "force-dynamic";

export default async function PrepResourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireStudent();
  const r = await getPrepResource(user, id);
  if (!r) notFound();
  const t = await getTranslations("student.prep");
  const { html, embedUrl: embed, fileId } = r;

  return (
    <>
      <Link href="/app/prep" className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("back")}
      </Link>
      <PageHeader eyebrow={t(`type.${r.type as "VIDEO"}`)} title={r.title} />
      <article className="max-w-3xl rounded-[20px] border border-border bg-white p-5 text-ink sm:p-8">
        {embed ? (
          <div className="mb-6 aspect-video overflow-hidden rounded-[14px] bg-ink">
            <iframe src={embed} title={r.title} className="h-full w-full" allow="encrypted-media; picture-in-picture; fullscreen" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
          </div>
        ) : null}
        {html ? <div className="cms-prose" dangerouslySetInnerHTML={{ __html: html }} /> : null}
        <div className="mt-6 flex flex-wrap gap-2">
          {r.url && !embed ? (
            <a href={r.url} target="_blank" rel="noopener noreferrer" className={buttonVariants()}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {t("openResource")}
            </a>
          ) : null}
          {fileId ? (
            <a href={`/api/files/${fileId}`} className={buttonVariants({ variant: "outline" })}>
              <Download className="h-4 w-4" aria-hidden="true" />
              {t("downloadFile")}
            </a>
          ) : null}
        </div>
      </article>
    </>
  );
}
