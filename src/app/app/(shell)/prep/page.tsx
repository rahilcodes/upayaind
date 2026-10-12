import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BookOpen, CalendarPlus, FileQuestion, FileText, Link2, PlayCircle, Sparkles, Star } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { BookMockButton, CancelMockButton } from "@/components/student/mock-buttons";
import { requireStudent } from "@/server/auth/guards";
import { getPrepPage, MOCK_SCORE_KEYS } from "@/server/services/prep";
import { formatInTz } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Interview prep" };
export const dynamic = "force-dynamic";

const TYPE_ICON = { VIDEO: PlayCircle, ARTICLE: BookOpen, PDF: FileText, QUESTION_BANK: FileQuestion, LINK: Link2 } as const;

type Res = { id: string; title: string; type: string; tags: string[] };

async function ResourceCard({ r }: { r: Res }) {
  const t = await getTranslations("student.prep");
  const Icon = TYPE_ICON[r.type as keyof typeof TYPE_ICON] ?? BookOpen;
  return (
    <li className="relative flex min-w-0 items-start gap-3 rounded-[14px] border border-border bg-surface p-4 hover:border-primary/40">
      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-accent text-accent-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <Link href={`/app/prep/${r.id}`} className="font-semibold after:absolute after:inset-0 hover:text-primary">
          {r.title}
        </Link>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {t(`type.${r.type as "VIDEO"}`)}
          {r.tags.filter((x) => x !== "all").length ? ` · ${r.tags.filter((x) => x !== "all").join(", ")}` : ""}
        </p>
      </div>
    </li>
  );
}

export default async function PrepPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { user } = await requireStudent();
  const t = await getTranslations("student.prep");
  const view = sp.view === "all" ? "all" : "mine";
  const d = await getPrepPage(user, { view });
  const tz = d.timezone;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      {d.recommended ? (
        <section aria-labelledby="rec-h" className="mb-6 overflow-hidden rounded-[20px] border border-[#BFE3CF] bg-[#F1FAF5] p-4 sm:p-5 dark:bg-surface">
          <h2 id="rec-h" className="flex items-center gap-2 text-[17px] font-bold">
            <Sparkles className="h-5 w-5 text-success" aria-hidden="true" />
            {t("recommendedTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("recommendedFor", { round: d.recommended.interview.round, title: d.recommended.interview.application.jobTitle, company: d.recommended.interview.application.companyName, date: formatInTz(d.recommended.interview.scheduledAt, tz, "EEE d MMM, h:mm a") })}
          </p>
          {d.recommended.items.length ? (
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {d.recommended.items.map((r) => (
                <ResourceCard key={r.id} r={r} />
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm">{t("recommendedNone")}</p>
          )}
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px] [&>*]:min-w-0">
        <section aria-labelledby="lib-h">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="lib-h" className="text-[17px] font-bold">
                {t("library")}
              </h2>
              <p className="text-sm text-muted-foreground">{view === "mine" && d.targetTitles.length ? t("filteredFor", { titles: d.targetTitles.join(", ") }) : t("allResources", { count: d.libraryTotal })}</p>
            </div>
            <nav aria-label={t("libraryView")} className="flex gap-1 rounded-[12px] bg-surface-muted p-1">
              {(["mine", "all"] as const).map((v) => (
                <Link key={v} href={v === "all" ? "/app/prep?view=all" : "/app/prep"} aria-current={view === v ? "page" : undefined} className={cn("inline-flex min-h-10 items-center rounded-[9px] px-3 text-sm font-semibold", view === v ? "bg-surface shadow-sm" : "text-muted-foreground")}>
                  {t(`view.${v}`)}
                </Link>
              ))}
            </nav>
          </div>
          {d.library.length ? (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {d.library.map((r) => (
                <ResourceCard key={r.id} r={r} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={<BookOpen className="h-6 w-6" aria-hidden="true" />} title={t("libraryEmpty")} action={view === "mine" ? <Link href="/app/prep?view=all" className={buttonVariants({ variant: "outline", size: "sm" })}>{t("seeAll")}</Link> : undefined} className="bg-surface" />
          )}
        </section>

        <div className="grid grid-cols-1 content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("mocksTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {d.upcomingMocks.length ? (
                <div>
                  <p className="mb-2 text-sm font-semibold">{t("yourBookings")}</p>
                  <ul className="grid gap-2">
                    {d.upcomingMocks.map((m) => (
                      <li key={m.id} className="rounded-[12px] border border-[#BFE3CF] bg-[#F1FAF5] p-3 dark:bg-surface-muted">
                        <p className="font-semibold">{m.focus ?? t("mockDefault")}</p>
                        <p className="text-[13px] text-muted-foreground">
                          {formatInTz(m.scheduledAt, tz, "EEE d MMM, h:mm a")} · {t("minutes", { n: m.durationMin })} · {t("with", { name: m.with ?? t("coach") })}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {m.meetingLink ? (
                            <a href={m.meetingLink} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm", variant: "secondary" })}>
                              {t("join")}
                            </a>
                          ) : null}
                          <a href={`/api/student/mock-interviews/${m.id}/ics`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                            {t("addToCalendar")}
                          </a>
                          <CancelMockButton mockId={m.id} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div>
                <p className="mb-2 text-sm font-semibold">{t("openSlots")}</p>
                {d.openSlots.length ? (
                  <ul className="grid gap-2">
                    {d.openSlots.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 rounded-[12px] border border-border p-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{s.focus ?? t("mockDefault")}</p>
                          <p className="text-[13px] text-muted-foreground">
                            {formatInTz(s.scheduledAt, tz, "EEE d MMM, h:mm a")} · {t("with", { name: s.with ?? t("coach") })}
                          </p>
                        </div>
                        <BookMockButton slotId={s.id} label={t("bookLabel", { focus: s.focus ?? t("mockDefault"), when: formatInTz(s.scheduledAt, tz, "EEE d MMM, h:mm a") })} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-[12px] bg-surface-muted px-3 py-4 text-sm text-muted-foreground">{t("noSlots")}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {d.pastMocks.length ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("feedbackTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-4">
                  {d.pastMocks.map((m) => (
                    <li key={m.id} className="border-t border-border pt-4 first:border-0 first:pt-0">
                      <p className="font-semibold">{m.focus ?? t("mockDefault")}</p>
                      <p className="text-[13px] text-muted-foreground">
                        {formatInTz(m.scheduledAt, tz, "d MMM yyyy")} · {t(`mockStatus.${m.status as "DONE"}`)}
                      </p>
                      {Object.keys(m.scores).length ? (
                        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                          {MOCK_SCORE_KEYS.filter((k) => m.scores[k]).map((k) => (
                            <div key={k} className="flex items-center justify-between gap-2 text-sm">
                              <dt className="text-muted-foreground">{t(`score.${k}`)}</dt>
                              <dd className="flex items-center gap-0.5" aria-label={t("scoreOf", { n: m.scores[k]! })}>
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <Star key={n} className={cn("h-3.5 w-3.5", n <= m.scores[k]! ? "fill-warning text-warning" : "text-border-strong")} aria-hidden="true" />
                                ))}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                      {m.feedback ? <p className="mt-2 whitespace-pre-wrap rounded-[10px] bg-surface-muted p-3 text-sm">{m.feedback}</p> : null}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
