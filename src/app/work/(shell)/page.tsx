import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarClock, LayoutDashboard, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { ClockCard, type ClockState } from "@/components/attendance/clock-card";
import { StudentCard } from "@/components/work/student-card";
import { requireStaff } from "@/server/auth/guards";
import { getMyToday } from "@/server/services/attendance";
import { getTodayDashboard } from "@/server/services/work-dashboard";
import { dayKey } from "@/lib/dates";
import { formatInTz } from "@/lib/format";
import { tzLabel as tzAbbrev } from "@/components/work/tz";
import { firstName } from "@/lib/utils";
import { clockAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("work.today");
  return { title: t("metaTitle") };
}

/** /work — "Today" (approved Employee dashboard design; SPEC F8 + F10). */
export default async function TodayPage() {
  const { user, employee } = await requireStaff();
  const t = await getTranslations("work.today");
  const ts = await getTranslations("status");
  const now = new Date();
  const tz = user.timezone;
  const hour = Number(formatInTz(now, tz, "H"));
  const greeting = hour < 12 ? t("greetMorning") : hour < 17 ? t("greetAfternoon") : t("greetEvening");
  const isManager = user.role === "MANAGER" || user.role === "ADMIN";

  const [today, dash] = employee ? await Promise.all([getMyToday(user, now), getTodayDashboard(user, now)]) : [null, null];
  const d = today?.day;
  const clock: ClockState = {
    open: Boolean(d?.open),
    onBreak: Boolean(d?.onBreak),
    startedAt: d?.openSession?.startedAt.toISOString() ?? null,
    breakStartedAt: d?.openSession?.breakStartedAt?.toISOString() ?? null,
    clockedMinutes: d?.clockedMinutes ?? 0,
    breakMinutes: d?.breakMinutes ?? 0,
    activeMinutes: d?.activeMinutes ?? 0,
    firstLoginAt: d?.firstLoginAt?.toISOString() ?? null,
    computedAt: now.toISOString(),
    startedLabel: d?.openSession ? formatInTz(d.openSession.startedAt, tz, "h:mm a") : null,
    breakStartedLabel: d?.openSession?.breakStartedAt ? formatInTz(d.openSession.breakStartedAt, tz, "h:mm a") : null,
    firstLoginLabel: d?.firstLoginAt ? formatInTz(d.firstLoginAt, tz, "h:mm a") : null,
    tzLabel: tzAbbrev(tz, now),
    canTrack: Boolean(employee),
  };

  const header = (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-sm text-muted-foreground">
          {formatInTz(now, tz, "EEEE, d MMMM")} · {tzAbbrev(tz, now)}
        </p>
        <h1 className="mt-0.5 text-[26px] font-bold leading-tight tracking-[-0.01em] sm:text-[28px]">{t("greeting", { greeting, name: firstName(user.name) })}</h1>
      </div>
      {isManager ? (
        <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
          <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
          {t("openAdmin")}
        </Link>
      ) : null}
    </div>
  );

  if (!dash || !dash.cards.length) {
    return (
      <>
        {header}
        <div className="flex flex-col gap-6">
          {employee ? <ClockCard state={clock} action={clockAction} /> : null}
          <EmptyState
            className="bg-surface"
            icon={<Users className="h-6 w-6" aria-hidden="true" />}
            title={isManager ? t("emptyManagerTitle") : t("emptyTitle")}
            body={isManager ? t("emptyManagerBody") : t("emptyBody")}
            action={
              isManager ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Link href="/admin" className={buttonVariants()}>{t("openAdmin")}</Link>
                  <Link href="/admin/attendance" className={buttonVariants({ variant: "outline" })}>{t("openAttendance")}</Link>
                  <Link href="/work/messages?view=all" className={buttonVariants({ variant: "outline" })}>{t("reviewThreads")}</Link>
                </div>
              ) : null
            }
          />
        </div>
      </>
    );
  }

  const s = dash.stats;
  const proRatedFor = formatInTz(now, tz, "h:mm a");
  const todayKey = dayKey(now, tz);
  const lastLabel = (at: Date | null) => {
    if (!at) return null;
    return dayKey(at, tz) === todayKey ? formatInTz(at, tz, "h:mm a") : formatInTz(at, tz, "d MMM");
  };

  return (
    <>
      {header}
      <div className="flex flex-col gap-6">
        <ClockCard state={clock} action={clockAction} />

        <section aria-label={t("glance")} className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[16px] border border-border bg-surface px-5 py-[18px]">
            <p className="text-sm font-medium text-muted-foreground">{t("stats.applications")}</p>
            <p className="mb-2.5 mt-1 text-[30px] font-bold tabular">
              {s.applied} <span className="text-base font-medium text-muted-foreground">/ {s.target}</span>
            </p>
            <Progress value={s.applied} max={Math.max(1, s.target)} label={t("stats.applicationsLabel", { done: s.applied, target: s.target })} />
          </div>
          <div className="rounded-[16px] border border-border bg-surface px-5 py-[18px]">
            <p className="text-sm font-medium text-muted-foreground">{t("stats.onTrack")}</p>
            <p className="mt-1 text-[30px] font-bold tabular">
              {s.onTrack} <span className="text-base font-medium text-muted-foreground">{t("stats.ofActive", { count: s.activeStudents })}</span>
            </p>
            <p className={`mt-1.5 text-[13px] font-semibold ${s.behind + s.atRisk ? "text-[#8A5A12] dark:text-warning" : "text-success"}`}>
              {s.behind + s.atRisk ? t("stats.behindAtRisk", { behind: s.behind, atRisk: s.atRisk }) : t("stats.allOnTrack")}
            </p>
          </div>
          <div className="rounded-[16px] border border-border bg-surface px-5 py-[18px]">
            <p className="text-sm font-medium text-muted-foreground">{t("stats.interviews")}</p>
            <p className="mt-1 text-[30px] font-bold text-success tabular">{s.interviewsWeek}</p>
            <p className="mt-1.5 text-[13px] text-muted-foreground">{s.nextInterviewAt ? t("stats.next", { when: formatInTz(s.nextInterviewAt, tz, "EEE h:mm a") }) : t("stats.noneScheduled")}</p>
          </div>
          <div className="rounded-[16px] border border-border bg-surface px-5 py-[18px]">
            <p className="text-sm font-medium text-muted-foreground">{t("stats.unread")}</p>
            <p className="mt-1 text-[30px] font-bold tabular">{s.unread}</p>
            <Link href="/work/messages" className="mt-1.5 inline-block text-[13px] font-semibold">
              {t("stats.openMessages")}
            </Link>
          </div>
        </section>

        <div className="flex flex-wrap items-start gap-6">
          <section aria-labelledby="my-students" className="min-w-0 flex-[999_1_520px]">
            <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
              <h2 id="my-students" className="text-[19px] font-bold">{t("myStudents")}</h2>
              <span className="text-[13px] text-muted-foreground">{dash.fraction <= 0 ? t("beforeStart", { time: dash.schedule.startTime }) : t("proRated", { time: proRatedFor })}</span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4">
              {dash.cards.map((c) => (
                <StudentCard
                  key={c.id}
                  messageHref={`/work/messages?student=${c.id}`}
                  s={{ id: c.id, name: c.name, role: c.role, plan: c.plan, active: c.active, onboarded: c.onboarded, done: c.done, target: c.target, rag: c.rag, lastLabel: lastLabel(c.lastAppliedAt), unread: c.unread, cover: c.assignment === "COVER" }}
                />
              ))}
            </div>
          </section>

          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
            <section aria-labelledby="up-int" className="rounded-[16px] border border-border bg-surface p-5">
              <div className="mb-3.5 flex items-center justify-between gap-2">
                <h2 id="up-int" className="text-[17px] font-bold">{t("upcoming")}</h2>
                <Link href="/work/interviews" className="text-[13px] font-semibold">{t("viewAll")}</Link>
              </div>
              {dash.interviews.length ? (
                <ul>
                  {dash.interviews.map((i) => (
                    <li key={i.id} className="flex gap-3 border-t border-border py-3">
                      <div className="w-[46px] shrink-0 rounded-[10px] bg-[#E9F5EE] py-1.5 text-center text-success dark:bg-success/20 dark:text-[#7BD3A5]">
                        <div className="text-[11px] font-bold uppercase">{formatInTz(i.scheduledAt, tz, "EEE")}</div>
                        <div className="text-lg font-bold leading-tight">{formatInTz(i.scheduledAt, tz, "d")}</div>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {i.student} · {i.company}
                        </p>
                        <p className="text-[13px] text-muted-foreground">
                          {i.round} · {formatInTz(i.scheduledAt, tz, "h:mm a")} {tzAbbrev(tz, i.scheduledAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 border-t border-border pt-3 text-sm text-muted-foreground">
                  <CalendarClock className="h-4 w-4" aria-hidden="true" />
                  {t("noInterviews")}
                </p>
              )}
            </section>
            <section aria-labelledby="recent" className="rounded-[16px] border border-border bg-surface p-5">
              <h2 id="recent" className="mb-3.5 text-[17px] font-bold">{t("recent")}</h2>
              {dash.activity.length ? (
                <ul>
                  {dash.activity.map((a) => (
                    <li key={a.id} className="flex gap-2.5 border-t border-border py-2.5 text-sm">
                      <span aria-hidden="true" className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-blue" />
                      <div className="min-w-0">
                        <p>
                          {a.kind === "applied"
                            ? t("act.applied", { student: firstName(a.student), title: a.title ?? "", company: a.company ?? "" })
                            : a.kind === "reported"
                              ? t("act.reported", { student: firstName(a.student), company: a.company ?? "" })
                              : a.kind === "status"
                                ? t("act.status", { company: a.company ?? "", status: a.status ? ts(a.status) : "" })
                                : a.kind === "cover"
                                  ? t("act.cover", { student: a.student })
                                  : t("act.assigned", { student: a.student })}
                        </p>
                        <p className="text-[12.5px] text-muted-foreground">{dayKey(a.at, tz) === todayKey ? formatInTz(a.at, tz, "h:mm a") : formatInTz(a.at, tz, "EEE, h:mm a")}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-t border-border pt-3 text-sm text-muted-foreground">{t("noActivity")}</p>
              )}
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
