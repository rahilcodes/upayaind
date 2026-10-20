import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarPlus, Star, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { CoachSession } from "@/server/services/coach";
import { MOCK_SCORE_KEYS } from "@/server/services/prep";
import { formatInTz } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CancelSessionDialog, OutcomeDialog } from "@/app/coach/(shell)/sessions/coach-client";

const TONE: Record<CoachSession["status"], "grey" | "blue" | "green" | "red" | "amber"> = { OPEN: "grey", SCHEDULED: "blue", DONE: "green", NO_SHOW: "red", CANCELLED: "amber" };

/** Stars for a 1–5 score (server-safe). */
export function Stars({ n, label }: { n: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={label}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn("h-3.5 w-3.5", i <= n ? "fill-warning text-warning" : "text-border-strong")} aria-hidden="true" />
      ))}
    </span>
  );
}

/**
 * Card list of a coach's sessions (mobile-first: one card per session, actions
 * wrap under the details). `compact` hides scorecards (used on Today).
 */
export async function SessionList({ sessions, tz, now = new Date(), compact = false, showApplicant = true }: { sessions: CoachSession[]; tz: string; now?: Date; compact?: boolean; showApplicant?: boolean }) {
  const t = await getTranslations("coach.sessions");
  const tc = await getTranslations("coach.common");
  const cutoff = now.getTime() - 2 * 3600e3;
  return (
    <ul className="grid gap-3">
      {sessions.map((m) => {
        const overdue = m.status === "SCHEDULED" && m.scheduledAt.getTime() < cutoff;
        const live = m.status === "OPEN" || m.status === "SCHEDULED";
        const hasScores = Object.keys(m.scores).length > 0;
        return (
          <li key={m.id} className={cn("rounded-[16px] border bg-surface p-4", overdue ? "border-[#F2D9A6]" : "border-border")}>
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  <span className="truncate">{m.focus ?? tc("openSlot")}</span>
                  <Badge tone={TONE[m.status]}>{tc(`status.${m.status}`)}</Badge>
                </p>
                <p className="tabular mt-0.5 text-[13px] text-muted-foreground">
                  {formatInTz(m.scheduledAt, tz, "EEE d MMM, h:mm a")} · {tc("minutes", { n: m.durationMin })}
                </p>
                {showApplicant ? (
                  <p className="mt-1 text-sm">
                    {m.student ? (
                      <Link href={`/coach/applicants/${m.student.id}`} className="font-semibold hover:underline">
                        {m.student.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{tc("notBooked")}</span>
                    )}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {live && m.meetingLink ? (
                  <a href={m.meetingLink} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm", variant: "secondary" })}>
                    <Video className="h-4 w-4" aria-hidden="true" />
                    {t("join")}
                  </a>
                ) : null}
                {m.status === "SCHEDULED" && !overdue ? (
                  <a href={`/api/coach/sessions/${m.id}/ics`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                    <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                    {t("addToCalendar")}
                  </a>
                ) : null}
                {m.status === "SCHEDULED" && m.student ? <OutcomeDialog id={m.id} studentName={m.student.name} focus={m.focus} initialNotes={m.notes} /> : null}
                {live ? <CancelSessionDialog id={m.id} studentName={m.student?.name ?? null} /> : null}
              </div>
            </div>
            {!compact && (hasScores || m.feedback || m.notes) ? (
              <div className="mt-3 grid gap-2 border-t border-border pt-3 text-sm">
                {hasScores ? (
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-1 min-[480px]:grid-cols-2">
                    {MOCK_SCORE_KEYS.filter((k) => m.scores[k]).map((k) => (
                      <div key={k} className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">{tc(`score.${k}`)}</dt>
                        <dd>
                          <Stars n={m.scores[k]!} label={`${tc(`score.${k}`)}: ${m.scores[k]}/5`} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {m.feedback ? (
                  <p className="whitespace-pre-wrap rounded-[10px] bg-surface-muted p-3">
                    <span className="block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{t("feedback")}</span>
                    {m.feedback}
                  </p>
                ) : null}
                {m.notes ? (
                  <p className="whitespace-pre-wrap rounded-[10px] border border-dashed border-border-strong p-3">
                    <span className="block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{t("notes")}</span>
                    {m.notes}
                  </p>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
