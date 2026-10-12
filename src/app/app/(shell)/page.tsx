import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, CalendarDays, Clock, Inbox, MessageSquare, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { StatCard } from "@/components/portal/stat-card";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { ApplicationsChart } from "@/components/student/applications-chart";
import { Celebration } from "@/components/student/celebration";
import { ApplicationListItem, InterviewItem, RenewBanner } from "@/components/student/rows";
import { requireStudent } from "@/server/auth/guards";
import { getDashboard } from "@/server/services/student-dashboard";
import { formatDate, formatInTz } from "@/lib/format";
import { firstName } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

function greetingKey(hour: number) {
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

/** F6: student tracking dashboard. */
export default async function StudentDashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { user } = await requireStudent();
  const t = await getTranslations("student.dashboard");
  const d = await getDashboard(user);
  const tz = d.studentTimezone;
  const hour = Number(formatInTz(new Date(), tz, "H"));
  const plan = d.plan;
  const inactive = plan.hasPlan ? !plan.active : true;
  const todayPct = d.today.target ? Math.round((d.today.applied / d.today.target) * 100) : 0;

  return (
    <>
      <PageHeader
        eyebrow={formatInTz(new Date(), tz, "EEEE, d MMMM")}
        title={sp.welcome ? t("welcomeTitle", { name: firstName(d.name) }) : t(`greeting.${greetingKey(hour)}`, { name: firstName(d.name) })}
        description={d.specialist ? t("subtitle", { name: d.specialist.firstName }) : undefined}
        actions={
          <Link href="/app/applications" className={buttonVariants({ variant: "outline" })}>
            {t("allApplications")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        }
      />

      {inactive ? <RenewBanner /> : null}
      {d.celebrate ? <Celebration applicationId={d.celebrate.id} status={d.celebrate.status as "OFFER" | "HIRED"} company={d.celebrate.companyName} title={d.celebrate.jobTitle} /> : null}
      {!d.specialist && !inactive ? (
        <div role="status" className="mb-6 flex items-start gap-3 rounded-[16px] border border-[#C9D7FB] bg-[#EEF2FD] p-4 text-[#0A2BA8]">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t("assigningTitle")}</p>
            <p className="text-sm">{t("assigningBody")}</p>
          </div>
        </div>
      ) : null}

      {/* Top cards */}
      <section aria-label={t("statsLabel")} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard
          className="col-span-2 lg:col-span-1"
          label={t("appliedToday")}
          value={d.today.applied}
          suffix={d.today.target ? `/ ${d.today.target}` : undefined}
          progress={d.today.target ? { value: d.today.applied, max: d.today.target, label: t("todayProgress", { applied: d.today.applied, target: d.today.target }) } : undefined}
          hint={d.today.target ? t("todayHint", { pct: todayPct }) : inactive ? t("paused") : t("noTargetToday")}
        />
        <StatCard label={t("thisWeek")} value={d.thisWeek} hint={t("thisWeekHint")} />
        <StatCard label={t("total")} value={d.total} hint={t("totalHint")} />
        <StatCard label={t("interviews")} value={d.interviewsUpcoming} tone={d.interviewsUpcoming ? "success" : "default"} hint={t("interviewsHint")} className={d.interviewsUpcoming ? "border-[#BFE3CF] bg-[#F1FAF5] dark:bg-surface" : undefined} />
        <StatCard label={t("responseRate")} value={`${d.response.rate}%`} hint={t("responseHint", { responded: d.response.responded, total: d.response.total })} />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px] [&>*]:min-w-0">
        <div className="grid min-w-0 grid-cols-1 content-start gap-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{t("chartTitle")}</CardTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">{t("chartSubtitle")}</p>
              </div>
            </CardHeader>
            <CardContent>
              <ApplicationsChart data={d.chart.map(({ day, applied, target }) => ({ day, applied, target }))} target={d.chartTarget} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("latestTitle")}</CardTitle>
              <Link href="/app/applications" className="inline-flex min-h-9 items-center text-sm font-semibold text-primary hover:underline">
                {t("viewAll")}
              </Link>
            </CardHeader>
            <CardContent className="pt-2">
              {d.latest.length ? (
                <ul>
                  {d.latest.map((a) => (
                    <ApplicationListItem key={a.id} a={a} tz={tz} />
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<Inbox className="h-6 w-6" aria-hidden="true" />} title={t("noAppsTitle")} body={d.specialist ? t("noAppsBody", { name: d.specialist.firstName }) : t("noAppsBodyUnassigned")} className="border-0 py-8" />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid min-w-0 grid-cols-1 content-start gap-6">
          {/* Plan card */}
          <Card>
            <CardHeader>
              <CardTitle>{t("planTitle")}</CardTitle>
              <Link href="/app/billing" className="inline-flex min-h-9 items-center text-sm font-semibold text-primary hover:underline">
                {t("manage")}
              </Link>
            </CardHeader>
            <CardContent className="grid gap-4">
              {plan.hasPlan ? (
                <>
                  <div>
                    <p className="text-xl font-bold">{plan.planName}</p>
                    <p className="text-sm text-muted-foreground">{t("perDay", { count: plan.dailyTarget })}</p>
                  </div>
                  {plan.dayNumber && plan.totalDays ? (
                    <div>
                      <div className="mb-1.5 flex justify-between text-sm">
                        <span className="font-semibold tabular">{t("dayOf", { day: plan.dayNumber, total: plan.totalDays })}</span>
                        {plan.periodEnd ? <span className="text-muted-foreground">{plan.endsAtPeriodEnd || !plan.active ? t("endsOn", { date: formatDate(plan.periodEnd, tz) }) : t("renewsOn", { date: formatDate(plan.periodEnd, tz) })}</span> : null}
                      </div>
                      <Progress value={plan.dayNumber} max={plan.totalDays} label={t("dayOf", { day: plan.dayNumber, total: plan.totalDays })} />
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="text-sm">
                  <p className="text-muted-foreground">{plan.pendingPayment ? t("pendingPlan") : t("noPlan")}</p>
                  <Link href="/app/billing" className={buttonVariants({ size: "sm", className: "mt-3" })}>
                    {plan.pendingPayment ? t("completePayment") : t("choosePlan")}
                  </Link>
                </div>
              )}
              <div className="flex items-center gap-3 rounded-[14px] bg-surface-muted p-3">
                {d.specialist ? (
                  <>
                    <Avatar name={d.specialist.firstName} size={44} tone="ink" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-muted-foreground">{t("yourSpecialist")}</p>
                      <p className="truncate font-semibold">{d.specialist.firstName}</p>
                      {d.specialist.cover ? <p className="text-[12px] text-muted-foreground">{t("coverNote", { name: d.specialist.cover.firstName })}</p> : null}
                    </div>
                    <Link href="/app/messages" className={buttonVariants({ size: "sm" })}>
                      <MessageSquare className="h-4 w-4" aria-hidden="true" />
                      {t("message")}
                    </Link>
                  </>
                ) : (
                  <>
                    <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
                      <Clock className="h-5 w-5" />
                    </span>
                    <p className="text-sm text-muted-foreground">{t("assigningShort")}</p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Upcoming interviews */}
          <Card>
            <CardHeader>
              <CardTitle>{t("upcomingTitle")}</CardTitle>
              <Link href="/app/interviews" className="inline-flex min-h-9 items-center text-sm font-semibold text-primary hover:underline">
                {t("viewAll")}
              </Link>
            </CardHeader>
            <CardContent>
              {d.upcomingInterviews.length ? (
                <ul className="grid grid-cols-1 gap-3">
                  {d.upcomingInterviews.map((i) => (
                    <InterviewItem key={i.id} i={i} tz={tz} showPrep={false} stacked />
                  ))}
                </ul>
              ) : (
                <div className="flex items-start gap-3 text-sm text-muted-foreground">
                  <CalendarDays className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <p>
                    {t("noInterviews")}{" "}
                    <Link href="/app/prep" className="font-semibold text-primary hover:underline">
                      {t("prepLink")}
                    </Link>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
