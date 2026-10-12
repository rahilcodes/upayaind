import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import { LoadBar, Section } from "@/components/admin/bits";
import { PageHeader } from "@/components/portal/portal-shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { requireAction } from "@/server/auth/guards";
import { getAssignmentsPage } from "@/server/services/admin-assignments";
import { formatDate, formatInTz, timeAgo } from "@/lib/format";
import { AutoAssignAll, EndCoverButton, QueueRowActions, RulesForm } from "./assignment-client";

export const metadata: Metadata = { title: "Assignments" };
export const dynamic = "force-dynamic";

export default async function AssignmentsPage() {
  const user = await requireAction("assignment.manage");
  const t = await getTranslations("admin.assignments");
  const tc = await getTranslations("admin.common");
  const ts = await getTranslations("admin.student360");
  const d = await getAssignmentsPage();
  const tz = user.timezone;
  const isAdmin = user.role === "ADMIN";
  const activeBoard = d.board.filter((b) => b.status === "ACTIVE");
  const optionsFor = (marketId: string) =>
    activeBoard.filter((b) => b.marketIds.includes(marketId)).map((b) => ({ id: b.id, name: b.name, code: b.code, active: b.active, max: b.max, accepting: b.accepting }));
  const used = activeBoard.reduce((s, b) => s + b.active, 0);
  const cap = activeBoard.reduce((s, b) => s + b.max, 0);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <Section
        id="queue"
        title={t("queueTitle", { count: d.queue.length })}
        description={d.rules.autoAssignEnabled ? t("queueDescription") : t("queueDescriptionOff")}
        actions={<AutoAssignAll ids={d.queue.map((q) => q.id)} />}
        className={d.queue.length ? "border-[#F2D9A6]" : undefined}
      >
        {d.queue.length ? (
          <ul className="divide-y divide-border">
            {d.queue.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-[200px] flex-1">
                  <Link href={`/admin/students/${q.id}`} className="font-semibold hover:underline">
                    {q.name}
                  </Link>
                  <p className="text-[13px] text-muted-foreground">
                    {q.market} · {q.plan ?? t("noPlan")} · {q.since ? t("waiting", { ago: timeAgo(q.since) }) : ""}
                  </p>
                </div>
                <QueueRowActions studentId={q.id} studentName={q.name} options={optionsFor(q.marketId)} isAdmin={isAdmin} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<CheckCircle2 className="h-6 w-6" aria-hidden="true" />} title={t("queueEmpty")} body={t("queueEmptyBody")} className="py-8" />
        )}
      </Section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Section id="board" title={t("boardTitle")} description={t("boardDescription", { used, cap })}>
          {d.board.length ? (
            <ul className="grid gap-4 sm:grid-cols-2">
              {d.board.map((b) => (
                <li key={b.id} className="rounded-[14px] border border-border p-4">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/admin/employees/${b.id}`} className="font-semibold hover:underline">
                        {b.name}
                      </Link>
                      <p className="text-[12px] text-muted-foreground">
                        {b.code} · {b.markets.join(", ")}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {b.status === "INVITED" ? <Badge tone="amber">{t("invited")}</Badge> : null}
                      {!b.accepting ? <Badge tone="slate">{t("paused")}</Badge> : null}
                    </div>
                  </div>
                  <LoadBar active={b.active} max={b.max} label={tc("atCapacity")} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t("boardEmpty")} className="py-8" />
          )}
        </Section>

        <div className="grid content-start gap-6">
          <Section id="rules" title={t("rulesTitle")}>
            <RulesForm autoAssignEnabled={d.rules.autoAssignEnabled} defaultMaxStudents={d.rules.defaultMaxStudents} editable={isAdmin} />
          </Section>
          <Section id="covers" title={t("coversTitle")} description={t("coversDescription")}>
            {d.covers.length ? (
              <ul className="divide-y divide-border">
                {d.covers.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-2 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 text-[13px]">
                      <p className="font-semibold">
                        <Link href={`/admin/students/${c.student.id}`} className="hover:underline">
                          {c.student.user.name}
                        </Link>{" "}
                        → {c.employee.user.name}
                      </p>
                      <p className="tabular text-muted-foreground">
                        {formatDate(c.startsAt, tz)} – {c.endsAt ? formatDate(c.endsAt, tz) : "—"}
                        {!c.isActive ? ` · ${t("ended")}` : ""}
                      </p>
                    </div>
                    {c.isActive ? <EndCoverButton id={c.id} label={t("endCoverFor", { name: c.student.user.name })} /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("coversEmpty")}</p>
            )}
          </Section>
        </div>
      </div>

      <Section id="recent" className="mt-6" title={t("recentTitle")}>
        {d.recent.length ? (
          <TableWrap className="border-0">
            <Table className="min-w-[760px]">
              <THead>
                <tr>
                  <TH>{t("when")}</TH>
                  <TH>{t("student")}</TH>
                  <TH>{t("employee")}</TH>
                  <TH>{t("kind")}</TH>
                  <TH>{t("by")}</TH>
                </tr>
              </THead>
              <tbody>
                {d.recent.map((r) => (
                  <TR key={r.id}>
                    <TD className="tabular whitespace-nowrap text-[13px]">{formatInTz(r.createdAt, tz, "d MMM, h:mm a")}</TD>
                    <TD>
                      <Link href={`/admin/students/${r.student.id}`} className="font-semibold hover:underline">
                        {r.student.user.name}
                      </Link>
                    </TD>
                    <TD className="text-[13px]">{r.employee.user.name}</TD>
                    <TD>
                      <span className="flex flex-wrap gap-1">
                        <Badge tone={r.type === "COVER" ? "cyan" : "blue"}>{ts(`type.${r.type}`)}</Badge>
                        <Badge tone="grey">{ts(`source.${r.source}`)}</Badge>
                        {!r.isActive ? <Badge tone="slate">{t("ended")}</Badge> : null}
                      </span>
                      {r.endReason ? <span className="mt-1 block text-[12px] text-muted-foreground">{r.endReason}</span> : null}
                    </TD>
                    <TD className="text-[13px]">{r.createdByName ?? tc("system")}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        ) : (
          <p className="text-sm text-muted-foreground">{t("recentEmpty")}</p>
        )}
      </Section>
    </>
  );
}
