import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AlertTriangle, ArrowRight, Clock, Coffee } from "lucide-react";
import { DailyBarChart, FunnelChart, RevenueChart } from "@/components/admin/charts";
import { RagBadge, Section, TodayProgress } from "@/components/admin/bits";
import { PageHeader } from "@/components/portal/portal-shell";
import { StatCard } from "@/components/portal/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/server/auth/guards";
import { applicationsPerDay, funnel, getOverview, revenuePerMonth } from "@/server/services/admin-metrics";
import { formatInTz, formatMoney, percent } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const t = await getTranslations("admin.overview");
  const tz = user.timezone;
  const [o, perDay, revenue, fun] = await Promise.all([getOverview(tz), applicationsPerDay(tz, 30), revenuePerMonth(tz, 12), funnel(30)]);
  const behindTop = o.behind.slice(0, 8);
  const pctToday = percent(o.appliedToday, o.targetToday);

  const linkCls = "font-semibold text-primary hover:underline";
  return (
    <>
      <PageHeader title={t("title")} description={t("description", { time: formatInTz(new Date(), tz, "EEE d MMM, h:mm a") })} />

      <section aria-label={t("kpis")} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <StatCard label={t("activeStudents")} value={o.activeStudents} hint={t("ofTotal", { total: o.totalStudents })} />
        <div className="rounded-[16px] border border-border bg-surface px-5 py-[18px]">
          <p className="text-sm font-medium text-muted-foreground">{t("mrr")}</p>
          {o.mrr.length ? (
            <ul className="mt-1 space-y-0.5">
              {o.mrr.map((m) => (
                <li key={m.currency} className="flex items-baseline justify-between gap-2">
                  <span className="tabular text-[24px] font-bold leading-tight">{formatMoney(m.amountMinor, m.currency)}</span>
                  <span className="text-[12px] font-semibold text-muted-foreground">{m.currency}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tabular mt-1 text-[30px] font-bold leading-tight">—</p>
          )}
          <p className="mt-1.5 text-[13px] text-muted-foreground">{t("mrrHint")}</p>
        </div>
        <StatCard label={t("newThisWeek")} value={o.newStudentsWeek} hint={t("newHint")} />
        <StatCard label={t("churn")} value={o.churn.churned} hint={t("churnHint", { rate: Math.round(o.churn.rate * 1000) / 10 })} tone={o.churn.churned ? "warning" : "default"} />
        <StatCard
          label={t("appliedToday")}
          value={o.appliedToday}
          suffix={`/ ${o.targetToday}`}
          progress={{ value: o.appliedToday, max: Math.max(1, o.targetToday), label: t("appliedToday") }}
          hint={t("appliedHint", { pct: pctToday })}
        />
        <StatCard label={t("belowTarget")} value={o.behind.length} tone={o.behind.length ? "warning" : "success"} hint={<Link href="/admin/students?below=1" className={linkCls}>{t("seeList")}</Link>} />
        <StatCard label={t("interviewsWeek")} value={o.interviewsWeek} />
        <StatCard label={t("offersMonth")} value={o.offersMonth} tone={o.offersMonth ? "success" : "default"} />
        <StatCard label={t("clockedIn")} value={o.clockedIn.length} hint={<Link href="/admin/attendance" className={linkCls}>{t("attendance")}</Link>} />
        <StatCard label={t("pendingLeave")} value={o.pendingLeave} tone={o.pendingLeave ? "warning" : "default"} hint={<Link href="/admin/leave" className={linkCls}>{t("review")}</Link>} />
        <StatCard label={t("awaiting")} value={o.awaiting} tone={o.awaiting ? "warning" : "default"} hint={<Link href="/admin/assignments" className={linkCls}>{t("assignNow")}</Link>} />
        <StatCard label={t("newLeads")} value={o.newLeads} hint={<Link href="/admin/leads?status=NEW" className={linkCls}>{t("openInbox")}</Link>} />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section
          id="behind"
          title={t("behindTitle")}
          description={t("behindDescription")}
          actions={
            o.behind.length > behindTop.length ? (
              <Link href="/admin/students?below=1" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                {t("viewAll", { count: o.behind.length })} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : null
          }
        >
          {behindTop.length ? (
            <ul className="divide-y divide-border">
              {behindTop.map((r) => (
                <li key={r.studentId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/students/${r.studentId}`} className="font-semibold hover:underline">
                      {r.name}
                    </Link>
                    <p className="truncate text-[13px] text-muted-foreground">{r.employeeName ? t("withEmployee", { name: r.employeeName, plan: r.planName ?? "—" }) : t("unassigned")}</p>
                  </div>
                  <TodayProgress applied={r.applied} target={r.target} rag={r.rag} />
                  <RagBadge rag={r.rag} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t("behindEmpty")} body={t("behindEmptyBody")} className="py-8" />
          )}
        </Section>

        <Section id="clocked" title={t("clockedTitle")} description={t("clockedDescription")}>
          {o.clockedIn.length ? (
            <ul className="divide-y divide-border">
              {o.clockedIn.map((c) => (
                <li key={c.employeeId} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <Link href={`/admin/employees/${c.employeeId}`} className="font-semibold hover:underline">
                    {c.name}
                  </Link>
                  <span className={cn("inline-flex items-center gap-1.5 text-[13px]", c.onBreak ? "text-warning" : "text-muted-foreground")}>
                    {c.onBreak ? <Coffee className="h-4 w-4" aria-hidden="true" /> : <Clock className="h-4 w-4" aria-hidden="true" />}
                    {c.onBreak ? t("onBreak") : t("since", { time: formatInTz(c.since, tz, "h:mm a") })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t("clockedEmpty")} className="py-8" />
          )}
        </Section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Section id="apd" title={t("perDayTitle")} description={t("perDayDescription", { total: perDay.reduce((s, d) => s + d.count, 0) })}>
          <DailyBarChart label={t("perDayTitle")} data={perDay.map((d) => ({ ...d, label: formatInTz(new Date(`${d.day}T12:00:00Z`), "UTC", "d MMM") }))} />
        </Section>
        <Section id="funnel" title={t("funnelTitle")} description={t("funnelDescription")}>
          <FunnelChart
            label={t("funnelTitle")}
            steps={[
              { name: t("funnelLeads"), value: fun.leads },
              { name: t("funnelSignups"), value: fun.signups, note: fun.leads ? `${percent(fun.signups, fun.leads)}%` : undefined },
              { name: t("funnelPaid"), value: fun.paid, note: fun.signups ? `${percent(fun.paid, fun.signups)}%` : undefined },
            ]}
          />
          <p className="mt-2 text-[13px] text-muted-foreground">{t("funnelNote")}</p>
        </Section>
      </div>

      <Section id="revenue" className="mt-6" title={t("revenueTitle")} description={t("revenueDescription")} actions={<Link href="/admin/reports?tab=revenue" className={buttonVariants({ variant: "ghost", size: "sm" })}>{t("fullReport")}</Link>}>
        {revenue.length ? (
          <div className={cn("grid gap-6", revenue.length > 1 && "lg:grid-cols-2")}>
            {revenue.map((r) => {
              const total = r.points.reduce((s, p) => s + p.netMinor, 0);
              return (
                <div key={r.currency}>
                  <p className="mb-2 flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">{r.currency}</span>
                    <span className="tabular text-sm text-muted-foreground">{t("revenueTotal", { amount: formatMoney(total, r.currency) })}</span>
                  </p>
                  <RevenueChart currency={r.currency} label={`${t("revenueTitle")} ${r.currency}`} data={r.points.map((p) => ({ ...p, label: formatInTz(new Date(`${p.month}-15T12:00:00Z`), "UTC", "MMM yy") }))} />
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={<AlertTriangle className="h-6 w-6" aria-hidden="true" />} title={t("revenueEmpty")} className="py-8" />
        )}
      </Section>
    </>
  );
}
