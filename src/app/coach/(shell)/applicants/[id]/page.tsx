import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { SessionList } from "@/components/coach/session-list";
import { PageHeader } from "@/components/portal/portal-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAction } from "@/server/auth/guards";
import { coachContext, getCoacheeDetail } from "@/server/services/coach";
import { formatInTz } from "@/lib/format";
import { tzLabel } from "@/components/work/tz";
import { ScheduleSessionDialog } from "../../sessions/coach-client";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("coach.applicants");
  return { title: t("metaTitle") };
}

/** /coach/applicants/[id] — one applicant's session history + scorecards. Access: assertCoachCanAccessStudent (D-140). */
export default async function CoachApplicantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAction("coach.sessions");
  const ctx = await coachContext(user);
  const t = await getTranslations("coach.applicants");
  const s = await getCoacheeDetail(ctx, id); // throws ForbiddenError (403) when the student isn't the coach's
  if (!s) notFound();
  const now = new Date();
  const tz = user.timezone;

  return (
    <>
      <Link href="/coach/applicants" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        {t("back")}
      </Link>
      <PageHeader
        title={s.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {s.assigned ? <Badge tone="blue">{t("assigned")}</Badge> : <Badge tone="grey">{t("booked")}</Badge>}
            <span>
              {t("localTime")}: {formatInTz(now, s.timezone, "h:mm a")} {tzLabel(s.timezone, now)}
            </span>
          </span>
        }
        actions={s.assigned && ctx.employeeId ? <ScheduleSessionDialog applicants={[{ id: s.id, name: s.name, timezone: s.timezone }]} timezone={tz} presetStudentId={s.id} /> : null}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-labelledby="hist-h">
          <h2 id="hist-h" className="mb-3.5 text-[19px] font-bold">
            {t("history")}
          </h2>
          {s.sessions.length ? <SessionList sessions={s.sessions} tz={tz} now={now} showApplicant={false} /> : <p className="rounded-[14px] border border-dashed border-border-strong px-4 py-8 text-center text-sm text-muted-foreground">{t("historyEmpty")}</p>}
        </section>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{t("targets")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-[13px] text-muted-foreground">{t("targets")}</dt>
                <dd className="font-medium">{s.targetTitles.length ? s.targetTitles.join(", ") : t("noTargets")}</dd>
              </div>
              <div>
                <dt className="text-[13px] text-muted-foreground">{t("seniority")}</dt>
                <dd className="font-medium">{s.seniority ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[13px] text-muted-foreground">{t("industries")}</dt>
                <dd className="font-medium">{s.industries.length ? s.industries.join(", ") : "—"}</dd>
              </div>
              <div>
                <dt className="text-[13px] text-muted-foreground">{t("market")}</dt>
                <dd className="font-medium">{s.market}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
