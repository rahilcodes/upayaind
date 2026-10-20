import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarClock, Users } from "lucide-react";
import { SessionList } from "@/components/coach/session-list";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAction } from "@/server/auth/guards";
import { coachContext, getCoachToday, listMyCoachees } from "@/server/services/coach";
import { formatInTz } from "@/lib/format";
import { tzLabel } from "@/components/work/tz";
import { firstName } from "@/lib/utils";
import { PublishSlotsDialog, ScheduleSessionDialog } from "./sessions/coach-client";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("coach.today");
  return { title: t("metaTitle") };
}

/** /coach — Today: the next 7 days of my sessions, open slots and quick actions (D-140). */
export default async function CoachTodayPage() {
  const user = await requireAction("coach.sessions");
  const ctx = await coachContext(user);
  const t = await getTranslations("coach.today");
  const tc = await getTranslations("coach.common");
  const now = new Date();
  const tz = user.timezone;
  const hour = Number(formatInTz(now, tz, "H"));
  const greeting = hour < 12 ? t("greetMorning") : hour < 17 ? t("greetAfternoon") : t("greetEvening");
  const [d, applicants] = await Promise.all([getCoachToday(ctx, now, tz), listMyCoachees(ctx)]);

  const header = (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-sm text-muted-foreground">
          {formatInTz(now, tz, "EEEE, d MMMM")} · {tzLabel(tz, now)}
        </p>
        <h1 className="mt-0.5 text-[26px] font-bold leading-tight tracking-[-0.01em] sm:text-[28px]">{t("greeting", { greeting, name: firstName(user.name) })}</h1>
      </div>
      {ctx.employeeId ? (
        <div className="flex flex-wrap gap-2">
          <PublishSlotsDialog timezone={tz} />
          <ScheduleSessionDialog applicants={applicants} timezone={tz} />
        </div>
      ) : null}
    </div>
  );

  if (!ctx.employeeId) {
    return (
      <>
        {header}
        <EmptyState className="bg-surface" icon={<Users className="h-6 w-6" aria-hidden="true" />} title={tc("noProfileTitle")} body={tc("noProfileBody")} />
      </>
    );
  }

  const stat = (label: string, value: number, extra?: React.ReactNode) => (
    <div className="rounded-[16px] border border-border bg-surface px-5 py-[18px]">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-[30px] font-bold">{value}</p>
      {extra}
    </div>
  );

  return (
    <>
      {header}
      <div className="flex flex-col gap-6">
        <section aria-label={t("glance")} className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4">
          {stat(t("stats.today"), d.todayCount)}
          {stat(t("stats.week"), d.upcoming.length)}
          {stat(t("stats.openSlots"), d.openSlots.length)}
          {stat(
            t("stats.toRecord"),
            d.toRecord,
            d.toRecord ? (
              <Link href="/coach/sessions?view=past&status=SCHEDULED" className="mt-1.5 inline-block text-[13px] font-semibold">
                {t("recordNow")}
              </Link>
            ) : undefined,
          )}
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <section aria-labelledby="up-h">
            <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
              <h2 id="up-h" className="text-[19px] font-bold">
                {t("upcoming")}
              </h2>
              <Link href="/coach/sessions" className="text-[13px] font-semibold">
                {t("viewAll")}
              </Link>
            </div>
            {d.upcoming.length ? (
              <SessionList sessions={d.upcoming} tz={tz} now={now} compact />
            ) : (
              <EmptyState className="bg-surface" icon={<CalendarClock className="h-6 w-6" aria-hidden="true" />} title={t("noUpcoming")} action={<ScheduleSessionDialog applicants={applicants} timezone={tz} variant="outline" />} />
            )}
          </section>
          <section aria-labelledby="open-h" className="rounded-[16px] border border-border bg-surface p-5">
            <h2 id="open-h" className="mb-3.5 text-[17px] font-bold">
              {t("openSlotsTitle")}
            </h2>
            {d.openSlots.length ? (
              <ul className="divide-y divide-border">
                {d.openSlots.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{s.focus ?? tc("openSlot")}</p>
                      <p className="tabular text-[13px] text-muted-foreground">
                        {formatInTz(s.scheduledAt, tz, "EEE d MMM, h:mm a")} · {tc("minutes", { n: s.durationMin })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noOpenSlots")}</p>
            )}
            <div className="mt-4">
              <PublishSlotsDialog timezone={tz} />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
