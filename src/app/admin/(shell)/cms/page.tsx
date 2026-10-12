import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TD, TH, THead, TR, Table, TableWrap } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatInTz } from "@/lib/format";
import { requireRole } from "@/server/auth/guards";
import { CMS_KINDS, countByKind, listEntries, publicPath, type CmsKind } from "@/server/services/cms";

export const metadata: Metadata = { title: "Content", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CmsListPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const user = await requireRole(["ADMIN"]);
  const sp = await searchParams;
  const kind: CmsKind = (CMS_KINDS as readonly string[]).includes(sp.kind ?? "") ? (sp.kind as CmsKind) : "PAGE";
  const [t, rows, counts] = await Promise.all([getTranslations("cms"), listEntries(kind), countByKind()]);
  const kindOne = t(`kindOne.${kind}`);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Link href={`/admin/cms/new?kind=${kind}`} className={buttonVariants()}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("new", { kind: kindOne })}
          </Link>
        }
      />
      <nav aria-label={t("kindsNav")} className="-mx-1 mb-5 overflow-x-auto px-1 pb-1">
        <ul className="flex min-w-max gap-1 rounded-[var(--radius-lg)] bg-surface-muted p-1">
          {CMS_KINDS.map((k) => (
            <li key={k}>
              <Link
                href={`/admin/cms?kind=${k}`}
                aria-current={k === kind ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-md)] px-3.5 text-sm font-semibold text-muted-foreground",
                  k === kind && "bg-surface text-foreground shadow-sm",
                )}
              >
                {t(`kinds.${k}`)}
                <span className="rounded-full bg-track px-1.5 text-xs tabular">{counts[k] ?? 0}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <p className="mb-4 text-sm text-muted-foreground">{t(`kindHelp.${kind}`)}</p>
      {rows.length === 0 ? (
        <EmptyState
          title={t("empty")}
          action={
            <Link href={`/admin/cms/new?kind=${kind}`} className={buttonVariants({ variant: "secondary" })}>
              {t("new", { kind: kindOne })}
            </Link>
          }
        />
      ) : (
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>{t("colTitle")}</TH>
                  <TH className="hidden md:table-cell">{t("colSlug")}</TH>
                  <TH>{t("colStatus")}</TH>
                  <TH className="hidden sm:table-cell">{t("colUpdated")}</TH>
                  <TH className="hidden lg:table-cell">{t("colOrder")}</TH>
                  <TH className="text-right">
                    <span className="sr-only">{t("edit")}</span>
                  </TH>
                </TR>
              </THead>
              <tbody>
                {rows.map((r) => {
                  const path = r.isPublished ? publicPath(r.kind, r.slug) : null;
                  return (
                    <TR key={r.id}>
                      <TD className="max-w-[340px]">
                        <Link href={`/admin/cms/${r.id}`} className="font-semibold text-foreground hover:text-primary hover:underline">
                          {r.title}
                        </Link>
                      </TD>
                      <TD className="hidden font-mono text-[13px] text-muted-foreground md:table-cell">{r.slug}</TD>
                      <TD>
                        <span className="flex flex-wrap gap-1.5">
                          <Badge tone={r.isPublished ? "green" : "grey"} dot>
                            {r.isPublished ? t("published") : t("draft")}
                          </Badge>
                          {r.noindex ? <Badge tone="outline">{t("noindex")}</Badge> : null}
                        </span>
                      </TD>
                      <TD className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">{formatInTz(r.updatedAt, user.timezone, "d MMM yyyy, h:mm a")}</TD>
                      <TD className="hidden tabular text-muted-foreground lg:table-cell">{r.sortOrder}</TD>
                      <TD className="whitespace-nowrap text-right">
                        {path ? (
                          <a href={path} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                            {t("view")}
                          </a>
                        ) : null}
                        <Link href={`/admin/cms/${r.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                          {t("edit")}
                        </Link>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
      )}
    </>
  );
}
