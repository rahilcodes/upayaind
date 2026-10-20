import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Users } from "lucide-react";
import { Stars } from "@/components/coach/session-list";
import { PageHeader } from "@/components/portal/portal-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAction } from "@/server/auth/guards";
import { coachContext, listCoachees } from "@/server/services/coach";
import { MOCK_SCORE_KEYS } from "@/server/services/prep";
import { formatInTz } from "@/lib/format";
import { PublishSlotsDialog } from "../sessions/coach-client";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("coach.applicants");
  return { title: t("metaTitle") };
}

/** /coach/applicants — my coachees with next session, last scorecard and target titles (D-140). */
export default async function CoachApplicantsPage() {
  const user = await requireAction("coach.sessions");
  const ctx = await coachContext(user);
  const t = await getTranslations("coach.applicants");
  const rows = await listCoachees(ctx);
  const tz = user.timezone;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      {rows.length === 0 ? (
        <EmptyState className="bg-surface" icon={<Users className="h-6 w-6" aria-hidden="true" />} title={t("empty")} body={t("emptyBody")} action={ctx.employeeId ? <PublishSlotsDialog timezone={tz} /> : undefined} />
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4">
          {rows.map((s) => {
            const avg = s.last ? MOCK_SCORE_KEYS.map((k) => s.last!.scores[k] ?? 0).filter(Boolean) : [];
            const mean = avg.length ? Math.round(avg.reduce((a, b) => a + b, 0) / avg.length) : 0;
            return (
              <li key={s.id} className="relative flex flex-col gap-3 rounded-[16px] border border-border bg-surface p-4 hover:border-primary/40">
                <div className="flex items-center gap-3">
                  <Avatar name={s.name} size={40} tone="blue" />
                  <div className="min-w-0">
                    <Link href={`/coach/applicants/${s.id}`} className="block truncate font-semibold after:absolute after:inset-0 hover:text-primary">
                      {s.name}
                    </Link>
                    <p className="text-[13px] text-muted-foreground">{s.assigned ? <Badge tone="blue">{t("assigned")}</Badge> : <Badge tone="grey">{t("booked")}</Badge>}</p>
                  </div>
                </div>
                <dl className="grid gap-2 text-sm">
                  <div>
                    <dt className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{t("nextSession")}</dt>
                    <dd className="tabular">{s.next ? `${formatInTz(s.next.scheduledAt, tz, "EEE d MMM, h:mm a")}${s.next.focus ? ` · ${s.next.focus}` : ""}` : <span className="text-muted-foreground">{t("noNext")}</span>}</dd>
                  </div>
                  <div>
                    <dt className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{t("lastScore")}</dt>
                    <dd>
                      {s.last ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <Stars n={mean} label={`${mean}/5`} />
                          <span className="tabular text-[13px] text-muted-foreground">{formatInTz(s.last.scheduledAt, tz, "d MMM")}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{t("noScore")}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{t("targets")}</dt>
                    <dd>{s.targetTitles.length ? s.targetTitles.join(", ") : <span className="text-muted-foreground">{t("noTargets")}</span>}</dd>
                  </div>
                </dl>
                <p className="text-[13px] text-muted-foreground">{t("sessions", { count: s.sessions })}</p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
