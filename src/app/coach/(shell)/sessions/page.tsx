import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarClock } from "lucide-react";
import { SessionList } from "@/components/coach/session-list";
import { PageHeader } from "@/components/portal/portal-shell";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Select } from "@/components/ui/input";
import { requireAction } from "@/server/auth/guards";
import { COACH_SESSION_STATUSES, coachContext, listCoachSessions, listMyCoachees } from "@/server/services/coach";
import { cn } from "@/lib/utils";
import { PublishSlotsDialog, ScheduleSessionDialog } from "./coach-client";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("coach.sessions");
  return { title: t("metaTitle") };
}

/** /coach/sessions — upcoming / past sessions with filters, publish + schedule (D-140). */
export default async function CoachSessionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireAction("coach.sessions");
  const ctx = await coachContext(user);
  const t = await getTranslations("coach.sessions");
  const tc = await getTranslations("coach.common");
  const now = new Date();
  const tz = user.timezone;
  const [{ filter, items }, applicants] = await Promise.all([listCoachSessions(ctx, sp, now), listMyCoachees(ctx)]);
  const cutoff = now.getTime() - 2 * 3600e3;
  const toRecord = filter.view === "upcoming" ? 0 : items.filter((m) => m.status === "SCHEDULED" && m.scheduledAt.getTime() < cutoff).length;
  const href = (view: "upcoming" | "past") => (view === "upcoming" ? "/coach/sessions" : "/coach/sessions?view=past");

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          ctx.employeeId ? (
            <>
              <PublishSlotsDialog timezone={tz} />
              <ScheduleSessionDialog applicants={applicants} timezone={tz} />
            </>
          ) : null
        }
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t("views")}>
          <ul className="inline-flex gap-1 rounded-[14px] bg-surface-muted p-1">
            {(["upcoming", "past"] as const).map((v) => (
              <li key={v}>
                <Link href={href(v)} aria-current={filter.view === v ? "page" : undefined} className={cn("inline-flex min-h-10 items-center rounded-[10px] px-4 text-sm font-semibold", filter.view === v ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {t(`view.${v}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <form method="get" action="/coach/sessions" aria-label={t("filters")} className="flex flex-wrap items-end gap-2">
          {filter.view === "past" ? <input type="hidden" name="view" value="past" /> : null}
          <Field id="f-status" label={t("status")} className="min-w-[160px]">
            <Select id="f-status" name="status" defaultValue={filter.status ?? ""}>
              <option value="">{t("anyStatus")}</option>
              {COACH_SESSION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {tc(`status.${s}`)}
                </option>
              ))}
            </Select>
          </Field>
          <button type="submit" className={buttonVariants({ variant: "outline" })}>
            {t("apply")}
          </button>
          {filter.status ? (
            <Link href={href(filter.view)} className={buttonVariants({ variant: "ghost" })}>
              {t("clear")}
            </Link>
          ) : null}
        </form>
      </div>

      {toRecord ? (
        <div role="status" className="mb-4 rounded-[14px] border border-[#F2D9A6] bg-[#FDF3E1] px-4 py-3 text-sm text-[#7A4E0E] dark:border-border dark:bg-surface dark:text-foreground">
          <p className="font-semibold">{t("toRecordTitle", { count: toRecord })}</p>
          <p>{t("toRecordBody")}</p>
        </div>
      ) : null}

      {items.length ? (
        <SessionList sessions={items} tz={tz} now={now} />
      ) : (
        <EmptyState className="bg-surface" icon={<CalendarClock className="h-6 w-6" aria-hidden="true" />} title={filter.view === "upcoming" ? t("emptyUpcoming") : t("emptyPast")} />
      )}
    </>
  );
}
