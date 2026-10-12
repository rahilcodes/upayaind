import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Search, Users } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { TableWrap, Table, THead, TH, TR, TD } from "@/components/ui/table";
import { RagBar, RagPill } from "@/components/work/rag";
import { requireStaff } from "@/server/auth/guards";
import { listMyStudents } from "@/server/services/work-dashboard";
import { formatInTz } from "@/lib/format";
import { cn, initials } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("work.students");
  return { title: t("metaTitle") };
}

/** /work/students — my assigned students (PRIMARY + active COVER). */
export default async function MyStudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user } = await requireStaff();
  const sp = await searchParams;
  const t = await getTranslations("work.students");
  const tc = await getTranslations("work.common");
  const ts = await getTranslations("subscriptionStatus");
  const data = await listMyStudents(user, { q: sp.q, status: sp.status as never, plan: sp.plan });
  const tz = user.timezone;

  if (!data) {
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState className="bg-surface" title={tc("noProfileTitle")} body={tc("noProfileBody")} action={<Link href="/admin/students" className={buttonVariants()}>{t("allStudents")}</Link>} />
      </>
    );
  }
  const filtered = Boolean(sp.q || sp.status || sp.plan);

  return (
    <>
      <PageHeader title={t("title")} description={t("description", { count: data.total })} />
      <form method="get" className="mb-5 grid grid-cols-1 gap-3 rounded-[18px] border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto] lg:items-end">
        <Field id="q" label={tc("search")}>
          <Input id="q" name="q" type="search" defaultValue={sp.q} placeholder={t("searchPlaceholder")} />
        </Field>
        <Field id="status" label={t("status")}>
          <Select id="status" name="status" defaultValue={sp.status ?? ""}>
            <option value="">{tc("any")}</option>
            <option value="active">{t("filter.active")}</option>
            <option value="inactive">{t("filter.inactive")}</option>
            <option value="below">{t("filter.below")}</option>
            <option value="onboarding">{t("filter.onboarding")}</option>
          </Select>
        </Field>
        <Field id="plan" label={t("plan")}>
          <Select id="plan" name="plan" defaultValue={sp.plan ?? ""}>
            <option value="">{tc("any")}</option>
            {data.plans.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </Field>
        <div className="flex gap-2">
          <Button type="submit">
            <Search className="h-4 w-4" aria-hidden="true" />
            {tc("apply")}
          </Button>
          {filtered ? <Link href="/work/students" className={buttonVariants({ variant: "ghost" })}>{tc("clear")}</Link> : null}
        </div>
      </form>

      {data.rows.length === 0 ? (
        <EmptyState className="bg-surface" icon={<Users className="h-6 w-6" aria-hidden="true" />} title={filtered ? t("noMatch") : t("emptyTitle")} body={filtered ? undefined : t("emptyBody")} />
      ) : (
        <TableWrap>
          <Table className="min-w-[960px]">
            <caption className="sr-only">{t("caption")}</caption>
            <THead>
              <tr>
                <TH>{t("col.student")}</TH>
                <TH>{t("col.plan")}</TH>
                <TH>{t("col.today")}</TH>
                <TH>{t("col.rag")}</TH>
                <TH>{t("col.onboarding")}</TH>
                <TH>{t("col.periodEnd")}</TH>
                <TH>{t("col.total")}</TH>
                <TH><span className="sr-only">{t("col.actions")}</span></TH>
              </tr>
            </THead>
            <tbody>
              {data.rows.map((s) => (
                <TR key={s.id} className={cn(!s.active && "opacity-70")}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">{initials(s.name)}</span>
                      <div className="min-w-0">
                        <Link href={`/work/students/${s.id}`} className="font-semibold text-foreground hover:underline">{s.name}</Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {s.role ?? t("noRole")} · {s.market}
                          {s.assignment === "COVER" ? ` · ${t("cover")}` : ""}
                        </p>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <p className="font-medium">{s.plan ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{s.subscriptionStatus ? ts(s.subscriptionStatus) : t("noSubscription")}</p>
                  </TD>
                  <TD className="min-w-[150px]">
                    <p className="mb-1 font-semibold tabular">{s.target ? `${s.done} / ${s.target}` : s.done}</p>
                    <RagBar done={s.done} target={s.target} rag={s.rag} label={t("progressLabel", { name: s.name })} />
                  </TD>
                  <TD><RagPill rag={s.rag} /></TD>
                  <TD>
                    <span className={cn("text-sm", s.onboarded ? "text-success" : "font-semibold text-[#8A5A12] dark:text-warning")}>{s.onboarded ? t("onboarded") : t("onboardingPending")}</span>
                  </TD>
                  <TD className="whitespace-nowrap tabular">{s.periodEnd ? formatInTz(s.periodEnd, tz, "d MMM yyyy") : "—"}</TD>
                  <TD className="tabular">{s.totalApplications}</TD>
                  <TD>
                    <div className="flex justify-end gap-2">
                      {s.active ? <Link href={`/work/students/${s.id}/apply`} className={buttonVariants({ size: "sm", variant: "ink" })}>{t("apply")}</Link> : null}
                      <Link href={`/work/students/${s.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>{t("open")}</Link>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </>
  );
}
