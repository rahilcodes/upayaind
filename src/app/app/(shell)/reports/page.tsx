import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Download, FileBarChart2 } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireStudent } from "@/server/auth/guards";
import { listStudentReports } from "@/server/services/student-reports";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Weekly reports" };
export const dynamic = "force-dynamic";

/** F13 / D-112: every weekly PDF report generated for the student. */
export default async function ReportsPage() {
  const { user, student } = await requireStudent();
  const t = await getTranslations("student.reports");
  const reports = await listStudentReports(student.id);
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Card>
        <CardContent className="pt-2">
          {reports.length ? (
            <ul className="divide-y divide-border">
              {reports.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-accent text-accent-foreground">
                      <FileBarChart2 className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{r.filename ?? r.key.split("/").pop()}</p>
                      <p className="text-[13px] text-muted-foreground">
                        {t("generated", { date: formatDate(r.createdAt, user.timezone) })} · {t("size", { kb: Math.max(1, Math.round(r.size / 1024)) })}
                      </p>
                    </div>
                  </div>
                  <Link href={`/api/files/${r.id}`} className={buttonVariants({ size: "sm", variant: "outline" })} prefetch={false}>
                    <Download className="h-4 w-4" aria-hidden="true" />
                    {t("download")}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<FileBarChart2 className="h-6 w-6" aria-hidden="true" />} title={t("emptyTitle")} body={t("emptyBody")} className="border-0 py-10" />
          )}
        </CardContent>
      </Card>
    </>
  );
}
