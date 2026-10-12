import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ExternalLink, FileUp, MessageSquare, ShieldAlert, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { StatusPill } from "@/components/portal/status-pill";
import { CompanyLogo } from "@/components/portal/company-logo";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CredentialsPanel } from "@/components/work/credentials";
import { RagBar, RagPill } from "@/components/work/rag";
import { StatusSelect } from "@/components/work/status-select";
import { ForbiddenError } from "@/server/auth/access";
import { requireStaff } from "@/server/auth/guards";
import { TRANSITIONS } from "@/server/services/applications";
import { listCredentialsForStaff } from "@/server/services/vault";
import { getStudentOverview } from "@/server/services/work-dashboard";
import { proRateFraction, ragFor } from "@/server/services/targets";
import { DEFAULT_SCHEDULE, parseSchedule } from "@/server/services/attendance";
import { formatInTz } from "@/lib/format";
import { quickStatusAction } from "../../actions";
import { revealCredentialAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("work.studentDetail");
  return { title: t("metaTitle") };
}

function Chips({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <span className="text-muted-foreground">{empty}</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((x) => (
        <li key={x} className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold">{x}</li>
      ))}
    </ul>
  );
}

/** /work/students/[id] — student overview for the assigned specialist. */
export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, employee } = await requireStaff();
  const t = await getTranslations("work.studentDetail");
  const tm = await getTranslations("workMode");
  const te = await getTranslations("employmentType");
  const tj = await getTranslations("jobSource");
  const tk = await getTranslations("work.studentDetail.vault.kinds");
  let data: Awaited<ReturnType<typeof getStudentOverview>>;
  let vault: Awaited<ReturnType<typeof listCredentialsForStaff>>;
  try {
    [data, vault] = await Promise.all([getStudentOverview(user, id), listCredentialsForStaff(user, id)]);
  } catch (e) {
    if (e instanceof ForbiddenError || (e instanceof Error && e.name === "UserError")) {
      return (
        <EmptyState
          className="mx-auto mt-10 max-w-xl bg-surface"
          icon={<ShieldAlert className="h-6 w-6" aria-hidden="true" />}
          title={t("noAccessTitle")}
          body={t("noAccessBody")}
          action={<Link href="/work/students" className={buttonVariants({ variant: "outline" })}><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("back")}</Link>}
        />
      );
    }
    throw e;
  }
  const tz = user.timezone;
  const s = data.student;
  const sub = data.subscription;
  const schedule = employee ? parseSchedule(employee.workSchedule) : DEFAULT_SCHEDULE;
  const rag = ragFor({ done: data.today.applied, target: data.today.target, fraction: proRateFraction(data.now, tz, schedule), active: sub.active, workingDay: data.today.target > 0 || !sub.active });
  const kindLabels: Record<string, string> = {};
  for (const k of ["EMAIL", "LINKEDIN", "INDEED", "DICE", "GLASSDOOR", "ZIPRECRUITER", "HANDSHAKE", "OTHER"]) kindLabels[k] = tk.has(k) ? tk(k) : k;
  const salary = s.minSalaryMinor && s.salaryCurrency ? new Intl.NumberFormat("en-US", { style: "currency", currency: s.salaryCurrency, maximumFractionDigits: 0 }).format(s.minSalaryMinor / 100) : null;

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/work/students" className="inline-flex items-center gap-1 font-semibold"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("back")}</Link>}
        title={s.user.name}
        description={[s.targetTitles[0], s.market.name, sub.planName].filter(Boolean).join(" · ")}
        actions={
          <>
            {data.threadId && data.assignment ? (
              <Link href={`/work/messages?thread=${data.threadId}`} className={buttonVariants({ variant: "outline" })}><MessageSquare className="h-4 w-4" aria-hidden="true" />{t("message")}</Link>
            ) : null}
            <Link href={`/work/students/${s.id}/import`} className={buttonVariants({ variant: "outline" })}><FileUp className="h-4 w-4" aria-hidden="true" />{t("import")}</Link>
            {sub.active ? <Link href={`/work/students/${s.id}/apply`} className={buttonVariants({ variant: "ink" })}>{t("apply")}</Link> : null}
          </>
        }
      />
      {data.assignment?.type === "COVER" ? (
        <p role="status" className="mb-4 rounded-[12px] border border-[#C6D9FC] bg-[#EAF1FE] px-4 py-3 text-sm text-[#1A4FB8] dark:border-border dark:bg-accent dark:text-accent-foreground">
          {t("coverNotice", { until: data.assignment.endsAt ? formatInTz(data.assignment.endsAt, tz, "d MMM, h:mm a") : "—" })}
        </p>
      ) : null}
      {!sub.active ? (
        <p role="status" className="mb-4 rounded-[12px] border border-border bg-surface-muted px-4 py-3 text-sm text-muted-foreground">{t("inactiveNotice")}</p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader><CardTitle>{t("today.title")}</CardTitle><RagPill rag={rag.rag} /></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <p className="text-[30px] font-bold tabular">{data.today.applied}<span className="ml-1 text-base font-medium text-muted-foreground">/ {data.today.target}</span></p>
                <RagBar done={data.today.applied} target={data.today.target} rag={rag.rag} label={t("today.progress")} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("today.total")}</p>
                <p className="text-xl font-bold tabular">{data.totals.applications}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("today.interviews")}</p>
                <p className="text-xl font-bold text-success tabular">{data.totals.interviews}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("recent.title")}</CardTitle>
              <Link href={`/work/applications?student=${s.id}`} className="text-sm font-semibold">{t("recent.all")}</Link>
            </CardHeader>
            <CardContent>
              {data.recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("recent.empty")}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.recent.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                      <CompanyLogo name={a.companyName} domain={a.companyDomain} size={36} />
                      <div className="min-w-0 flex-[1_1_220px]">
                        <a href={a.jobUrl} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 truncate font-semibold text-foreground hover:underline">
                          <span className="truncate">{a.jobTitle}</span>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        </a>
                        <p className="truncate text-xs text-muted-foreground">{a.companyName} · {tj(a.source)} · {formatInTz(a.appliedAt ?? a.createdAt, tz, "d MMM, h:mm a")}{a.mine ? "" : ` · ${t("recent.byOther")}`}</p>
                      </div>
                      <StatusPill status={a.status} />
                      <StatusSelect applicationId={a.id} status={a.status} allowed={TRANSITIONS[a.status]} action={quickStatusAction} label={t("recent.change", { title: a.jobTitle, company: a.companyName })} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("interviews.title")}</CardTitle>
              <Link href="/work/interviews" className="text-sm font-semibold">{t("interviews.manage")}</Link>
            </CardHeader>
            <CardContent>
              {data.interviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("interviews.empty")}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.interviews.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-semibold">{i.application.companyName} — {i.application.jobTitle}</p>
                        <p className="text-muted-foreground">{i.round} · {i.mode} · {formatInTz(i.scheduledAt, tz, "EEE d MMM, h:mm a")}</p>
                      </div>
                      {i.outcome ? <span className="text-xs font-semibold text-muted-foreground">{i.outcome}</span> : i.scheduledAt > data.now ? <span className="text-xs font-semibold text-success">{t("interviews.upcoming")}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader><CardTitle>{t("profile.title")}</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <dl className="grid gap-3">
                <div><dt className="text-muted-foreground">{t("profile.email")}</dt><dd className="break-all font-medium">{s.user.email}</dd></div>
                {s.user.phone ? <div><dt className="text-muted-foreground">{t("profile.phone")}</dt><dd className="font-medium">{s.user.phone}</dd></div> : null}
                <div><dt className="text-muted-foreground">{t("profile.localTime")}</dt><dd className="font-medium">{formatInTz(data.now, s.user.timezone, "h:mm a")} ({s.user.timezone})</dd></div>
                <div><dt className="text-muted-foreground">{t("profile.plan")}</dt><dd className="font-medium">{sub.planName ?? "—"}{sub.periodEnd ? ` · ${t("profile.until", { date: formatInTz(sub.periodEnd, tz, "d MMM yyyy") })}` : ""}</dd></div>
                <div><dt className="text-muted-foreground">{t("profile.onboarding")}</dt><dd className="font-medium">{s.onboardingCompletedAt ? t("profile.onboarded") : t("profile.onboardingStep", { step: s.onboardingStep })}</dd></div>
                <div><dt className="text-muted-foreground">{t("profile.master")}</dt><dd className="font-medium">{s.hasMaster ? t("profile.masterYes") : t("profile.masterNo")}</dd></div>
              </dl>
              {s.summary ? <p className="rounded-[12px] bg-surface-muted p-3 text-[13px] leading-relaxed">{s.summary}</p> : null}
              <div className="flex flex-wrap gap-3">
                {[["LinkedIn", s.linkedinUrl], ["GitHub", s.githubUrl], [t("profile.portfolio"), s.portfolioUrl]].filter(([, u]) => u).map(([l, u]) => (
                  <a key={l} href={u!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold">{l}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t("prefs.title")}</CardTitle></CardHeader>
            <CardContent className="grid gap-4 text-sm">
              <div><p className="mb-1.5 text-muted-foreground">{t("prefs.titles")}</p><Chips items={s.targetTitles} empty={t("prefs.none")} /></div>
              <div><p className="mb-1.5 text-muted-foreground">{t("prefs.locations")}</p><Chips items={[...s.locations, ...(s.remoteOk ? [t("prefs.remote")] : [])]} empty={t("prefs.none")} /></div>
              <div><p className="mb-1.5 text-muted-foreground">{t("prefs.modes")}</p><Chips items={[...s.workModes.map((m) => tm(m)), ...s.employmentTypes.map((e) => te(e))]} empty={t("prefs.none")} /></div>
              <dl className="grid grid-cols-2 gap-3">
                <div><dt className="text-muted-foreground">{t("prefs.workAuth")}</dt><dd className="font-medium">{s.workAuthorization ?? "—"}{s.needsSponsorship ? ` · ${t("prefs.sponsorship")}` : ""}</dd></div>
                <div><dt className="text-muted-foreground">{t("prefs.seniority")}</dt><dd className="font-medium">{s.seniority ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">{t("prefs.salary")}</dt><dd className="font-medium">{salary ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">{t("prefs.relocate")}</dt><dd className="font-medium">{s.willingToRelocate ? t("prefs.yes") : t("prefs.no")}</dd></div>
              </dl>
              <div><p className="mb-1.5 text-muted-foreground">{t("prefs.target")}</p><Chips items={s.targetCompanies} empty={t("prefs.none")} /></div>
              <div>
                <p className="mb-1.5 font-semibold text-danger">{t("prefs.avoid")}</p>
                <Chips items={s.avoidCompanies} empty={t("prefs.none")} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("vault.title")}</CardTitle>
              <ShieldCheck className="h-5 w-5 text-success" aria-hidden="true" />
            </CardHeader>
            <CardContent className="grid gap-3">
              <p className="text-[13px] text-muted-foreground">{vault.canReveal ? t("vault.notice") : t("vault.managerNotice")}</p>
              <CredentialsPanel
                items={vault.credentials.map((c) => ({ id: c.id, kind: c.kind, label: c.label, loginUrl: c.loginUrl, hasNotes: c.hasNotes, updatedAt: c.updatedAt.toISOString() }))}
                canReveal={vault.canReveal}
                action={revealCredentialAction}
                kindLabels={kindLabels}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
