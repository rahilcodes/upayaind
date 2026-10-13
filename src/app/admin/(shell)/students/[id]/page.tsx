import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AlertTriangle, ChevronLeft, Download, ExternalLink, FileText, KeyRound } from "lucide-react";
import { PaymentStatusPill, SubscriptionStatusPill } from "@/components/billing/status-pills";
import { Chips, KeyValue, RagBadge, Section, TodayProgress } from "@/components/admin/bits";
import { ThreadViewer } from "@/components/messaging/thread-viewer";
import { Pagination } from "@/components/portal/pagination";
import { PageHeader } from "@/components/portal/portal-shell";
import { StatusPill } from "@/components/portal/status-pill";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { requireAction } from "@/server/auth/guards";
import { getStudent360, reassignOptions, studentApplications } from "@/server/services/admin-students";
import { getThreadForAdmin } from "@/server/services/messaging";
import { listReferralsForAdmin } from "@/server/services/referrals";
import { formatDate, formatInTz, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DeletionControls, NotesEditor, PauseControls, StudentReassign } from "./student-actions";
import { AuditDiff } from "@/components/admin/audit-diff";

export const metadata: Metadata = { title: "Student" };
export const dynamic = "force-dynamic";

const TABS = ["overview", "applications", "resumes", "messages", "billing", "access", "audit"] as const;
type Tab = (typeof TABS)[number];

export default async function Student360Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireAction("students.view_all");
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "overview";
  const s = await getStudent360(id);
  if (!s) notFound();
  const referrals = await listReferralsForAdmin(s.id);
  const tcore = await getTranslations("common");
  const t = await getTranslations("admin.student360");
  const tc = await getTranslations("admin.common");
  const ti = await getTranslations("interval");
  const twm = await getTranslations("workMode");
  const tet = await getTranslations("employmentType");
  const tz = user.timezone;
  const isAdmin = user.role === "ADMIN";
  const current = s.assignments.find((a) => a.isActive && a.type === "PRIMARY") ?? null;
  const covers = s.assignments.filter((a) => a.isActive && a.type === "COVER");
  const activeSub = s.subscriptions.find((x) => x.status === "ACTIVE" || x.status === "PAUSED") ?? s.subscriptions[0] ?? null;
  const pausable = isAdmin && activeSub && (activeSub.status === "ACTIVE" || activeSub.status === "PAUSED") ? activeSub : null;
  const deletionState = s.user.deletedAt ? "deleted" : s.user.deletionRequestedAt ? "requested" : "none";
  const tabHref = (k: Tab) => (k === "overview" ? `/admin/students/${s.id}` : `/admin/students/${s.id}?tab=${k}`);

  return (
    <>
      <Link href="/admin/students" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        {t("back")}
      </Link>
      <PageHeader
        title={s.user.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{s.user.email}</span>
            <span aria-hidden="true">·</span>
            <span>{s.market.name}</span>
            {activeSub ? <SubscriptionStatusPill status={activeSub.status} /> : <Badge tone="outline">{t("noPlan")}</Badge>}
            {!s.onboardingCompletedAt ? <Badge tone="amber">{t("onboardingStep", { step: s.onboardingStep })}</Badge> : null}
          </span>
        }
        actions={
          <>
            <StudentReassign studentId={s.id} studentName={s.user.name} currentEmployeeId={current?.employee.id ?? null} options={await reassignOptions(s.id)} isAdmin={isAdmin} canViewAs={deletionState !== "deleted"} />
            {pausable ? <PauseControls subscriptionId={pausable.id} status={pausable.status} pausedSince={pausable.pausedAt ? formatDate(pausable.pausedAt, tz) : null} /> : null}
          </>
        }
      />

      {deletionState !== "none" ? (
        <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[#F3C5C0] bg-[#FCEAE8] px-5 py-4 text-[#7E1F18] dark:border-border dark:bg-surface dark:text-foreground">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">{deletionState === "deleted" ? t("deletedBanner") : t("requestedBanner")}</p>
              <p className="text-sm">
                {deletionState === "deleted"
                  ? t("deletedBody", { date: formatDate(new Date(s.user.deletedAt!.getTime() + 30 * 86400e3), tz) })
                  : t("requestedBody", { date: formatDate(s.user.deletionRequestedAt!, tz) })}
              </p>
            </div>
          </div>
          {isAdmin ? <DeletionControls studentId={s.id} state={deletionState} /> : <p className="text-sm">{t("adminOnly")}</p>}
        </div>
      ) : null}

      <nav aria-label={t("sections")} className="mb-5 overflow-x-auto">
        <ul className="inline-flex gap-1 rounded-[14px] bg-surface-muted p-1">
          {TABS.map((k) => (
            <li key={k}>
              <Link href={tabHref(k)} aria-current={tab === k ? "page" : undefined} className={cn("inline-flex min-h-10 items-center whitespace-nowrap rounded-[10px] px-4 text-sm font-semibold", tab === k ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {t(`tabs.${k}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "overview" ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="grid gap-6">
            <Section id="profile" title={t("profileTitle")}>
              <KeyValue
                items={[
                  { label: t("phone"), value: s.user.phone },
                  { label: t("timezone"), value: s.user.timezone },
                  { label: t("joined"), value: formatDate(s.createdAt, tz) },
                  { label: t("lastLogin"), value: s.user.lastLoginAt ? formatInTz(s.user.lastLoginAt, tz) : tc("never") },
                  { label: t("emailVerified"), value: s.user.emailVerified ? tc("yes") : tc("no") },
                  { label: t("consent"), value: s.consentApplyOnBehalfAt ? t("consentAt", { date: formatDate(s.consentApplyOnBehalfAt, tz), version: s.consentVersion ?? "—" }) : tc("notSet") },
                  {
                    label: t("links"),
                    value: (
                      <span className="flex flex-wrap gap-3">
                        {[s.linkedinUrl, s.githubUrl, s.portfolioUrl].filter(Boolean).length
                          ? [
                              ["LinkedIn", s.linkedinUrl],
                              ["GitHub", s.githubUrl],
                              [t("portfolio"), s.portfolioUrl],
                            ]
                              .filter(([, u]) => u)
                              .map(([l, u]) => (
                                <a key={l} href={u!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                                  {l} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                                </a>
                              ))
                          : "—"}
                      </span>
                    ),
                  },
                ]}
              />
            </Section>
            <Section id="prefs" title={t("prefsTitle")}>
              <KeyValue
                items={[
                  { label: t("targetTitles"), value: <Chips items={s.targetTitles} /> },
                  { label: t("seniority"), value: s.seniority },
                  { label: t("locations"), value: <Chips items={[...s.locations, ...(s.remoteOk ? [t("remoteOk")] : [])]} /> },
                  { label: t("workModes"), value: <Chips items={s.workModes.map((w) => twm(w))} /> },
                  { label: t("employmentTypes"), value: <Chips items={s.employmentTypes.map((w) => tet(w))} /> },
                  { label: t("industries"), value: <Chips items={s.industries} /> },
                  { label: t("workAuth"), value: s.workAuthorization ? `${s.workAuthorization}${s.needsSponsorship ? ` · ${t("needsSponsorship")}` : ""}` : null },
                  { label: t("minSalary"), value: s.minSalaryMinor && s.salaryCurrency ? formatMoney(s.minSalaryMinor, s.salaryCurrency) : null },
                  { label: t("relocate"), value: s.willingToRelocate ? tc("yes") : tc("no") },
                  { label: t("notice"), value: s.noticePeriod },
                  { label: t("targetCompanies"), value: <Chips items={s.targetCompanies} /> },
                  { label: t("avoidCompanies"), value: <Chips items={s.avoidCompanies} /> },
                ]}
              />
            </Section>
            <Section id="history" title={t("assignmentsTitle")} description={t("assignmentsDescription")}>
              {s.assignments.length ? (
                <ol className="relative space-y-4 border-l-2 border-border pl-5">
                  {s.assignments.map((a) => (
                    <li key={a.id} className="relative">
                      <span aria-hidden="true" className={cn("absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-surface", a.isActive ? "bg-success" : "bg-[#B5BCCD]")} />
                      <p className="font-semibold">
                        <Link href={`/admin/employees/${a.employee.id}`} className="hover:underline">
                          {a.employee.user.name}
                        </Link>{" "}
                        <span className="text-[13px] font-normal text-muted-foreground">{a.employee.employeeCode}</span>
                      </p>
                      <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
                        <Badge tone={a.type === "COVER" ? "cyan" : "blue"}>{t(`type.${a.type}`)}</Badge>
                        <Badge tone="grey">{t(`source.${a.source}`)}</Badge>
                        {a.isActive ? <Badge tone="green">{t("active")}</Badge> : null}
                        <span className="tabular">
                          {formatDate(a.startsAt, tz)} – {a.endsAt ? formatDate(a.endsAt, tz) : t("now")}
                        </span>
                      </p>
                      {a.endReason ? <p className="mt-0.5 text-[13px]">{t("endReason", { reason: a.endReason })}</p> : null}
                      {a.createdByName ? <p className="text-[12px] text-muted-foreground">{t("by", { name: a.createdByName })}</p> : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState title={s.assignmentQueue === "AWAITING" ? t("awaiting") : t("noAssignments")} className="py-8" />
              )}
            </Section>
          </div>
          <div className="grid content-start gap-6">
            <Section id="today" title={t("todayTitle")}>
              {s.today ? (
                <div className="flex items-center justify-between gap-4">
                  <TodayProgress applied={s.today.applied} target={s.today.target} rag={s.today.rag} />
                  <RagBadge rag={s.today.rag} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("todayInactive")}</p>
              )}
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">{t("specialist")}</dt>
                  <dd className="font-semibold">{current ? current.employee.user.name : s.assignmentQueue === "AWAITING" ? t("awaitingShort") : tc("unassigned")}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("cover")}</dt>
                  <dd className="font-semibold">{covers.length ? covers.map((c) => c.employee.user.name).join(", ") : "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("plan")}</dt>
                  <dd className="font-semibold">{activeSub ? `${activeSub.planPrice.plan.name} · ${ti(activeSub.planPrice.interval)}` : "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("periodEnd")}</dt>
                  <dd className="tabular font-semibold">{activeSub?.currentPeriodEnd ? formatDate(activeSub.currentPeriodEnd, tz) : "—"}</dd>
                </div>
              </dl>
            </Section>
            <Section id="notes" title={t("notesTitle")} description={t("notesDescription")}>
              <NotesEditor studentId={s.id} initial={s.internalNotes ?? ""} />
            </Section>
            <Section id="mocks" title={t("mocksTitle")}>
              {s.mocks.length ? (
                <ul className="divide-y divide-border">
                  {s.mocks.map((m) => {
                    const sc = m.scores as Record<string, number> | null;
                    return (
                      <li key={m.id} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold">{m.focus ?? t("mock")}</p>
                          <Badge tone={m.status === "DONE" ? "green" : m.status === "NO_SHOW" ? "red" : "blue"}>{t(`mockStatus.${m.status}` as "mockStatus.DONE")}</Badge>
                        </div>
                        <p className="tabular text-[13px] text-muted-foreground">
                          {formatInTz(m.scheduledAt, tz)} · {m.conductedBy ?? "—"}
                        </p>
                        {sc ? <p className="tabular mt-1 text-[13px]">{t("scores", { c: sc.communication ?? "—", t: sc.technical ?? "—", s: sc.structure ?? "—", f: sc.confidence ?? "—" })}</p> : null}
                        {m.feedback ? <p className="mt-1 whitespace-pre-line text-[13px]">{m.feedback}</p> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("mocksEmpty")}</p>
              )}
            </Section>
            {isAdmin && deletionState === "none" ? (
              <Section id="privacy" title={t("privacyTitle")} description={t("privacyDescription")}>
                <DeletionControls studentId={s.id} state="none" />
              </Section>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "applications" ? <ApplicationsTab studentId={s.id} cursor={sp.cursor} tz={tz} /> : null}

      {tab === "resumes" ? (
        s.resumes.length ? (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>{t("resumeTitle")}</TH>
                  <TH>{t("resumeKind")}</TH>
                  <TH>{t("resumeAts")}</TH>
                  <TH>{t("resumeCreated")}</TH>
                  <TH className="text-right">{t("download")}</TH>
                </tr>
              </THead>
              <tbody>
                {s.resumes.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-medium">
                      {r.title}
                      {r.lockedAt ? <Badge tone="grey" className="ml-2">{t("locked")}</Badge> : null}
                    </TD>
                    <TD className="text-[13px]">{t(`kind.${r.kind}`)}</TD>
                    <TD className="tabular">{r.atsScore ?? "—"}</TD>
                    <TD className="tabular text-[13px]">{formatInTz(r.createdAt, tz)}</TD>
                    <TD className="text-right">
                      {r.kind === "MASTER_UPLOAD" ? (
                        <span className="text-[13px] text-muted-foreground">—</span>
                      ) : (
                        <span className="inline-flex gap-1">
                          <a href={`/api/resumes/${r.id}/pdf`} className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label={`${t("download")} PDF: ${r.title}`}>
                            <Download className="h-4 w-4" aria-hidden="true" /> PDF
                          </a>
                          <a href={`/api/resumes/${r.id}/docx`} className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label={`${t("download")} DOCX: ${r.title}`}>
                            DOCX
                          </a>
                        </span>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        ) : (
          <EmptyState icon={<FileText className="h-6 w-6" aria-hidden="true" />} title={t("resumesEmpty")} className="bg-surface" />
        )
      ) : null}

      {tab === "messages" ? <MessagesTab threads={s.threads} selected={sp.thread} studentId={s.id} user={user} /> : null}

      {tab === "billing" ? (
        <div className="grid gap-6">
          <Section id="subs" title={t("subscriptionsTitle")}>
            {s.subscriptions.length ? (
              <TableWrap className="border-0">
                <Table>
                  <THead>
                    <tr>
                      <TH>{t("plan")}</TH>
                      <TH>{tc("view")}</TH>
                      <TH>{t("period")}</TH>
                      <TH>{t("provider")}</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {s.subscriptions.map((x) => (
                      <TR key={x.id}>
                        <TD className="font-medium">
                          {x.planPrice.plan.name} · {ti(x.planPrice.interval)}
                          <span className="tabular block text-[12px] text-muted-foreground">{formatMoney(x.planPrice.amountMinor, x.planPrice.currency, s.market.locale)} · {t("perDay", { n: x.planPrice.dailyTarget })}</span>
                        </TD>
                        <TD>
                          <SubscriptionStatusPill status={x.status} />
                          {x.cancelAtPeriodEnd ? <span className="block text-[12px] text-muted-foreground">{t("cancelsAtEnd")}</span> : null}
                        </TD>
                        <TD className="tabular text-[13px]">
                          {x.currentPeriodStart ? formatDate(x.currentPeriodStart, tz) : "—"} – {x.currentPeriodEnd ? formatDate(x.currentPeriodEnd, tz) : "—"}
                        </TD>
                        <TD className="text-[13px]">{x.provider}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noPlan")}</p>
            )}
          </Section>
          <Section id="payments" title={t("paymentsTitle")} actions={<Link href={`/admin/payments?q=${encodeURIComponent(s.user.email)}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>{t("openPayments")}</Link>}>
            {s.payments.length ? (
              <TableWrap className="border-0">
                <Table>
                  <THead>
                    <tr>
                      <TH>{t("date")}</TH>
                      <TH className="text-right">{t("amount")}</TH>
                      <TH>{tc("view")}</TH>
                      <TH>{t("invoice")}</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {s.payments.map((p) => (
                      <TR key={p.id}>
                        <TD className="tabular text-[13px]">{formatInTz(p.paidAt ?? p.createdAt, tz)}</TD>
                        <TD className="tabular text-right font-semibold">
                          {formatMoney(p.amountMinor, p.currency, s.market.locale)}
                          {p.refundedMinor ? <span className="block text-[12px] font-normal text-muted-foreground">{t("refunded", { amount: formatMoney(p.refundedMinor, p.currency, s.market.locale) })}</span> : null}
                        </TD>
                        <TD>
                          <PaymentStatusPill status={p.status} />
                        </TD>
                        <TD>
                          {p.fileId ? (
                            <a href={`/api/files/${p.fileId}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:underline">
                              <Download className="h-4 w-4" aria-hidden="true" />
                              {p.invoiceNumber}
                            </a>
                          ) : (
                            <span className="text-[13px]">{p.invoiceNumber ?? "—"}</span>
                          )}
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            ) : (
              <p className="text-sm text-muted-foreground">{t("paymentsEmpty")}</p>
            )}
          </Section>
          <Section id="referrals" title={t("referralsTitle")} description={t("referralsDescription")}>
            {referrals.referredBy ? (
              <p className="mb-3 text-sm">
                {t("referredBy")}{" "}
                <Link href={`/admin/students/${referrals.referredBy.referrer.id}`} className="font-semibold text-primary hover:underline">
                  {referrals.referredBy.referrer.user.name}
                </Link>{" "}
                <Badge tone={referrals.referredBy.status === "CREDITED" ? "green" : "amber"}>{t(`referralStatus.${referrals.referredBy.status}`)}</Badge>
              </p>
            ) : null}
            {referrals.made.length ? (
              <TableWrap>
                <Table>
                  <THead>
                    <TR>
                      <TH>{t("referralFriend")}</TH>
                      <TH>{tcore("status")}</TH>
                      <TH className="text-right">{t("referralCredit")}</TH>
                      <TH>{tcore("date")}</TH>
                    </TR>
                  </THead>
                  <tbody>
                    {referrals.made.map((r) => (
                      <TR key={r.id}>
                        <TD>
                          <Link href={`/admin/students/${r.referred.id}`} className="font-semibold text-primary hover:underline">
                            {r.referred.user.name}
                          </Link>
                        </TD>
                        <TD>
                          <Badge tone={r.status === "CREDITED" ? "green" : "amber"}>{t(`referralStatus.${r.status}`)}</Badge>
                        </TD>
                        <TD className="text-right tabular">{r.currency ? formatMoney(r.creditMinor, r.currency) : "—"}</TD>
                        <TD>{formatDate(r.creditedAt ?? r.createdAt, user.timezone)}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noReferrals")}</p>
            )}
          </Section>
        </div>
      ) : null}

      {tab === "access" ? (
        <Section id="vault" title={t("vaultTitle")} description={t("vaultDescription")}>
          {s.credentials.length ? (
            <div className="grid gap-5">
              {s.credentials.map((c) => (
                <div key={c.id} className="rounded-[14px] border border-border">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                    <p className="flex items-center gap-2 font-semibold">
                      <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      {c.label} <Badge tone="grey">{c.kind}</Badge>
                      {c.deletedAt ? <Badge tone="red">{t("credDeleted")}</Badge> : null}
                    </p>
                    <p className="text-[12px] text-muted-foreground">{t("credUpdated", { date: formatDate(c.updatedAt, tz) })}</p>
                  </div>
                  {c.accessLogs.length ? (
                    <ul className="divide-y divide-border">
                      {c.accessLogs.map((l) => (
                        <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
                          <span>
                            <span className="font-semibold">{l.userName ?? tc("system")}</span> · {t(`credAction.${l.action}` as "credAction.REVEAL")}
                          </span>
                          <span className="tabular text-muted-foreground">
                            {formatInTz(l.at, tz)}
                            {l.ip ? ` · ${l.ip}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-4 py-3 text-[13px] text-muted-foreground">{t("credNoAccess")}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("vaultEmpty")}</p>
          )}
        </Section>
      ) : null}

      {tab === "audit" ? (
        <Section id="audit" title={t("auditTitle")} description={t("auditDescription")} actions={<Link href={`/admin/audit-log?entityId=${s.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>{t("auditFull")}</Link>}>
          {s.audit.length ? (
            <ul className="divide-y divide-border">
              {s.audit.map((a) => (
                <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm">
                      <code className="rounded bg-surface-muted px-1.5 py-0.5 text-[12px] font-semibold">{a.action}</code> <span className="text-muted-foreground">{t("by", { name: a.actorName ?? tc("system") })}</span>
                    </p>
                    <span className="tabular text-[13px] text-muted-foreground">{formatInTz(a.at, tz)}</span>
                  </div>
                  <AuditDiff before={a.before} after={a.after} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("auditEmpty")}</p>
          )}
        </Section>
      ) : null}
    </>
  );
}

async function ApplicationsTab({ studentId, cursor, tz }: { studentId: string; cursor?: string; tz: string }) {
  const t = await getTranslations("admin.student360");
  const data = await studentApplications(studentId, cursor);
  if (!data.items.length) return <EmptyState title={t("appsEmpty")} className="bg-surface" />;
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Link href={`/admin/applications?student=${studentId}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          {t("appsOpenAll")}
        </Link>
      </div>
      <TableWrap>
        <Table className="min-w-[860px]">
          <THead>
            <tr>
              <TH>{t("appliedAt")}</TH>
              <TH>{t("company")}</TH>
              <TH>{t("role")}</TH>
              <TH>{t("byEmployee")}</TH>
              <TH>{t("status")}</TH>
              <TH className="text-right">{t("resume")}</TH>
            </tr>
          </THead>
          <tbody>
            {data.items.map((a) => (
              <TR key={a.id}>
                <TD className="tabular whitespace-nowrap text-[13px]">{a.appliedAt ? formatInTz(a.appliedAt, tz, "d MMM yyyy, h:mm a") : "—"}</TD>
                <TD className="font-semibold">{a.companyName}</TD>
                <TD>
                  <a href={a.jobUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 hover:underline">
                    {a.jobTitle} <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  </a>
                </TD>
                <TD className="text-[13px]">{a.employee.user.name}</TD>
                <TD>
                  <StatusPill status={a.status} />
                </TD>
                <TD className="text-right">
                  {a.resumeVersionId ? (
                    <a href={`/api/resumes/${a.resumeVersionId}/pdf`} className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label={`${t("resume")}: ${a.companyName}`}>
                      <Download className="h-4 w-4" aria-hidden="true" /> PDF
                    </a>
                  ) : (
                    "—"
                  )}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </TableWrap>
      <Pagination prevHref={cursor ? `/admin/students/${studentId}?tab=applications` : null} nextHref={data.nextCursor ? `/admin/students/${studentId}?tab=applications&cursor=${data.nextCursor}` : null} />
    </>
  );
}

async function MessagesTab({ threads, selected, studentId, user }: { threads: { id: string; isActive: boolean; employeeName: string; count: number }[]; selected?: string; studentId: string; user: { id: string; role: "ADMIN" | "MANAGER" | "EMPLOYEE" | "STUDENT"; timezone: string } }) {
  const t = await getTranslations("admin.student360");
  if (!threads.length) return <EmptyState title={t("messagesEmpty")} className="bg-surface" />;
  const active = threads.find((x) => x.id === selected) ?? threads.find((x) => x.isActive) ?? threads[0]!;
  const thread = await getThreadForAdmin(user, active.id);
  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <nav aria-label={t("threads")}>
        <ul className="grid gap-2">
          {threads.map((th) => (
            <li key={th.id}>
              <Link
                href={`/admin/students/${studentId}?tab=messages&thread=${th.id}`}
                aria-current={th.id === active.id ? "page" : undefined}
                className={cn("flex min-h-11 items-center justify-between gap-2 rounded-[12px] border px-3 py-2 text-sm", th.id === active.id ? "border-primary bg-accent font-semibold" : "border-border bg-surface hover:bg-surface-muted")}
              >
                <span className="truncate">{th.employeeName}</span>
                <span className="tabular text-[12px] text-muted-foreground">
                  {th.count}
                  {!th.isActive ? ` · ${t("closed")}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="rounded-[18px] border border-border bg-surface p-5">
        <ThreadViewer thread={thread} timezone={user.timezone} />
      </div>
    </div>
  );
}
